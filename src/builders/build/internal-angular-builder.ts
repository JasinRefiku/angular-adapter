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
    // browser bundle and there is no server bundle: server bundles, their polyfills and the
    // ngServerMode banner Angular adds for externals only get them from here.
    const buildOptions =
      opts?.externalsPlugin && !options.server
        ? { ...options, externalDependencies: targetExternals }
        : options;

    // Todo: share cache with Angular builder: https://github.com/angular/angular-cli/pull/32527
    // options.codeBundleCache = nfOptions.federationCache.bundlerCache;
    return buildApplicationInternal(buildOptions, context, extensions);
  };
