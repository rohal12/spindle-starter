import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Spindle Starter",
  description: "The easiest starter kit for building Spindle stories",

  base: "/spindle-starter/",

  head: [["meta", { name: "theme-color", content: "#6366f1" }]],

  themeConfig: {
    nav: [
      { text: "Guide", link: "/getting-started" },
      { text: "Customization", link: "/styles-and-scripts" },
      { text: "Publishing", link: "/publishing" },
      {
        text: "GitHub",
        link: "https://github.com/rohal12/spindle-starter",
      },
    ],

    sidebar: [
      {
        text: "Introduction",
        items: [
          { text: "What is Spindle Starter?", link: "/" },
          { text: "Getting Started", link: "/getting-started" },
          { text: "Dev Container", link: "/dev-container" },
        ],
      },
      {
        text: "Writing Your Story",
        items: [
          { text: "Project Structure", link: "/project-structure" },
          { text: "Passages & Twee", link: "/passages-and-twee" },
        ],
      },
      {
        text: "Customization",
        items: [
          { text: "Styles & Scripts", link: "/styles-and-scripts" },
          { text: "Fonts & Media", link: "/fonts-and-media" },
        ],
      },
      {
        text: "Shipping",
        items: [{ text: "Publishing", link: "/publishing" }],
      },
    ],

    socialLinks: [
      { icon: "github", link: "https://github.com/rohal12/spindle-starter" },
    ],

    footer: {
      message: "Released under the Unlicense.",
      copyright: "Public domain.",
    },

    search: {
      provider: "local",
    },

    editLink: {
      pattern:
        "https://github.com/rohal12/spindle-starter/edit/main/docs/:path",
      text: "Edit this page on GitHub",
    },
  },
});
