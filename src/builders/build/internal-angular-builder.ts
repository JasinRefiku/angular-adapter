// Portions adapted from angular/angular-cli (packages/angular/build/src/), which @angular/build's
// exports map doesn't expose (#153). Copyright Google LLC. MIT License: https://angular.dev/license

import { buildApplicationInternal } from "@angular/build/private";
import { type BuilderContext } from "@angular-devkit/architect";
import { type Plugin } from "esbuild";

export const createInternalAngularBuilder =
  (
    externals: string[],
    opts?: {
      instrumentForCoverage?: (filename: string) => boolean;
      define?: Record<string, string>;
      // True when the builder's `externals` plugin marks them in the browser bundle.
      externalsPlugin?: boolean;
    },
  ) =>
  (
    options: Parameters<typeof buildApplicationInternal>[0],
    context: BuilderContext,
    pluginsOrExtensions?:
      Plugin[] | Parameters<typeof buildApplicationInternal>[2],
  ) => {
    let extensions: Parameters<typeof buildApplicationInternal>[2];
    if (pluginsOrExtensions && Array.isArray(pluginsOrExtensions)) {
      extensions = {
        codePlugins: pluginsOrExtensions,
      };
    } else {
      extensions = pluginsOrExtensions as Parameters<
        typeof buildApplicationInternal
      >[2];
    }

    const targetExternals = options.externalDependencies;

    // serveWithVite fetches its own browserOptions independently, so ngBuilderOptions
    // modifications don't reach here. Add NF externals to externalDependencies so
    // Angular routes them to optimizeDeps.exclude, preventing Vite from trying to
    // pre-bundle packages that include native .node binaries. serveWithVite reads
    // them back from these options after each build.
    options.externalDependencies = [...(targetExternals ?? []), ...externals];

    if (opts?.instrumentForCoverage) {
      options.instrumentForCoverage = opts.instrumentForCoverage;
    }

    if (opts?.define) {
      options.define = { ...options.define, ...opts.define };
    }

    // Angular also applies externalDependencies to stylesheets, where an external package hides
    // its Sass partials (#167). Leave them out of the build when the `externals` plugin covers the
    // browser bundle and there is no server bundle or local polyfill file: server bundles, their
    // polyfills, the ngServerMode banner Angular adds for externals and a polyfills bundle with a
    // local file (Angular turns off `externalPackages` for it) only get them from here.
    // A proxy, not a copy: normalizeOptions writes its `ssr`/`prerender` corrections back onto the
    // options, and serveWithVite reads them from `options`.
    const buildOptions =
      opts?.externalsPlugin &&
      !options.server &&
      ![options.polyfills ?? []].flat().some(isLocalFile)
        ? new Proxy(options, {
            get: (target, key, receiver) =>
              key === "externalDependencies"
                ? targetExternals
                : Reflect.get(target, key, receiver),
          })
        : options;

    // Todo: share cache with Angular builder: https://github.com/angular/angular-cli/pull/32527
    // options.codeBundleCache = nfOptions.federationCache.bundlerCache;
    return buildApplicationInternal(buildOptions, context, extensions);
  };

// upstream: angular/angular-cli packages/angular/build/src/tools/esbuild/application-code-bundle.ts @ 11dbe297f8
function isLocalFile(path: string): boolean {
  if (path.startsWith("zone.js")) {
    return false;
  }

  return path[0] === "." || /\.[mc]?[jt]sx?$/.test(path);
}
