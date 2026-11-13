import postcssPresetEnv from "postcss-preset-env";

// No minifier here: Vite minifies the bundle itself after PostCSS
// (build.cssMinify, Lightning CSS by default), and it understands modern CSS
// such as container queries, which postcss-csso could not parse.
export default {
  plugins: [
    postcssPresetEnv({
      browsers: "last 2 versions",
    }),
  ],
};
