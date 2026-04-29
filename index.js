import { createApp, provide } from "vue";
import { createRouter, createWebHashHistory } from "vue-router";
import { GraffitiDecentralized } from "@graffiti-garden/implementation-decentralized";
import { GraffitiPlugin } from "@graffiti-garden/wrapper-vue";
import { useClassApp } from "./class-app.js";

const AppShell = {
  name: "AppShell",
  template: "#shell-template",
  setup() {
    const ctx = useClassApp();
    provide("classApp", ctx);
    return ctx;
  },
};

const loadHome = () =>
  import("./home/index.js").then((m) => m.default());
const loadCreate = () =>
  import("./create/index.js").then((m) => m.default());
const loadProfile = () =>
  import("./profile/index.js").then((m) => m.default());
const loadChat = () =>
  import("./chat/index.js").then((m) => m.default());

const loginPlaceholder = {
  name: "LoginPlaceholder",
  template: '<span class="route-filler" aria-hidden="true"></span>',
};

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: "/",
      component: AppShell,
      children: [
        { path: "login", name: "login", component: loginPlaceholder },
        { path: "", name: "home", component: loadHome },
        { path: "create", name: "create", component: loadCreate },
        { path: "profile", name: "profile", component: loadProfile },
        {
          path: "profile/:username",
          name: "profileUser",
          component: loadProfile,
        },
        {
          path: "chat/:chatId",
          name: "chat",
          component: loadChat,
          props: true,
        },
      ],
    },
  ],
});

createApp({ template: "<router-view />" })
  .use(router)
  .use(GraffitiPlugin, {
    graffiti: new GraffitiDecentralized(),
  })
  .mount("#app");
