const { resolve, join  } = require("path");

const webpack = require("webpack");
const nsWebpack = require("nativescript-dev-webpack");
const nativescriptTarget = require("nativescript-dev-webpack/nativescript-target");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const ExtractTextPlugin = require("extract-text-webpack-plugin");
const { BundleAnalyzerPlugin } = require("webpack-bundle-analyzer");
const { NativeScriptWorkerPlugin } = require("nativescript-worker-loader/NativeScriptWorkerPlugin");
const { AngularCompilerPlugin } = require("@ngtools/webpack");

const mainSheet = `app.css`;

module.exports = env => {
    const platform = getPlatform(env);
    const platforms = ["ios", "android"];

    const skipCodeGeneration = env.skipCodeGeneration;

    const ngToolsWebpackOptions = { tsConfigPath: skipCodeGeneration ? "tsconfig.json" : "tsconfig.aot.json"};

    // Default destination inside platforms/<platform>/...
    const path = resolve(nsWebpack.getAppPath(platform));

    const entry = {
        // Discover entry module from package.json
        bundle: skipCodeGeneration ? "./main.ts" : "./main.aot.ts", // TODO: `./${nsWebpack.getEntryModule()}`,

        // Vendor entry with third-party libraries
        vendor: `./vendor`,

        // Entry for stylesheet with global application styles
        [mainSheet]: `./${mainSheet}`,
    };

    const rules = getRules();
    const plugins = getPlugins(platform, env);

    const config = {
        context: resolve("./app"),
        target: nativescriptTarget,
        entry,
        output: {
            pathinfo: true,
            path,
            libraryTarget: "commonjs2",
            filename: "[name].js",
        },
        resolve: {
            extensions: [ ".js", ".ts", ".css" ],

            // Resolve {N} system modules from tns-core-modules
            modules: [
                "node_modules/tns-core-modules",
                "node_modules",
            ],

            alias: {
                '~': resolve("./app")
            },

            // This will not follow symlinks to their original location,
            // and will enable us to work with symlinked packages during development.
            symlinks: false
        },
        node: {
            // Disable node shims that conflict with NativeScript
            "http": false,
            "timers": false,
            "setImmediate": false,
            "fs": "empty",
        },
        module: { rules },
        plugins,
    };

    if (env.snapshot) {
        plugins.push(new nsWebpack.NativeScriptSnapshotPlugin({
            chunk: "vendor",
            projectRoot: __dirname,
            webpackConfig: config,
            targetArchs: ["arm", "arm64", "ia32"],
            tnsJavaClassesOptions: { packages: ["tns-core-modules" ] },
            useLibs: false
        }));
    }

    return config;

    function getPlatform() {
        return env.android ? "android" :
            env.ios ? "ios" :
            () => { throw new Error("You need to provide a target platform!") };
    }

    function getRules() {
        return [
            {
                test: /\.html$|\.xml$/,
                use: [
                    "raw-loader",
                ]
            },
            // Root stylesheet gets extracted with bundled dependencies
            {
                test: new RegExp(mainSheet),
                use: ExtractTextPlugin.extract([
                    {
                        loader: "resolve-url-loader",
                        options: { silent: true },
                    },
                    {
                        loader: "nativescript-css-loader",
                        options: { minimize: false }
                    },
                    "nativescript-dev-webpack/platform-css-loader",
                ]),
            },
            // Other CSS files get bundled using the raw loader
            {
                test: /\.css$/,
                exclude: new RegExp(mainSheet),
                use: [
                    "raw-loader",
                ]
            },
            // SASS support
            {
                test: /\.scss$/,
                use: [
                    "raw-loader",
                    "resolve-url-loader",
                    "sass-loader",
                ]
            },


            // Compile TypeScript files with ahead-of-time compiler.
            {
                test: /.ts$/,
                loader: "@ngtools/webpack"
            },

        ];
    }

    function getPlugins() {
        let plugins = [
            new ExtractTextPlugin(mainSheet),

            // Vendor libs go to the vendor.js chunk
            new webpack.optimize.CommonsChunkPlugin({
                name: ["vendor"],
            }),

            // Define useful constants like TNS_WEBPACK
            new webpack.DefinePlugin({
                "global.TNS_WEBPACK": "true",
                "global.skipCodeGeneration": skipCodeGeneration
            }),

            // Copy assets to out dir. Add your own globs as needed.
            new CopyWebpackPlugin([
                { from: mainSheet },
                { from: "css/**" },
                { from: "fonts/**" },
                { from: "**/*.jpg" },
                { from: "**/*.png" },
                { from: "**/*.xml" },
            ]),

            // Generate a bundle starter script and activate it in package.json
            new nsWebpack.GenerateBundleStarterPlugin([
                "./vendor",
                "./bundle",
            ]),
            
            // Support for web workers since v3.2
            new NativeScriptWorkerPlugin(),

            // Generate report files for bundles content
            new BundleAnalyzerPlugin({
                analyzerMode: "static",
                openAnalyzer: false,
                generateStatsFile: true,
                reportFilename: join(__dirname, "report", `report.html`),
                statsFilename: join(__dirname, "report", `stats.json`),
            }),

            new nsWebpack.NativeScriptAngularCompilerPlugin(
                Object.assign({
                    entryModule: resolve(__dirname, "app/app.module#AppModule"),
                    platformOptions: {
                        platform,
                        platforms,
                        skipCodeGeneration,
                        ignore: ["App_Resources"]
                    },
                }, ngToolsWebpackOptions)
            )
        ];

        if (env.uglify) {
            plugins.push(new webpack.LoaderOptionsPlugin({ minimize: true }));

            // Work around an Android issue by setting compress = false
            const compress = platform !== "android";
            plugins.push(new webpack.optimize.UglifyJsPlugin({
                mangle: { except: nsWebpack.uglifyMangleExcludes },
                compress,
            }));
        }

        return plugins;
    }
};