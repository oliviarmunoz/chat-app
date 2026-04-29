import { inject } from "vue";

export default async function loadCreateRoute() {
  const template = await fetch(new URL("./index.html", import.meta.url)).then((r) => r.text());
  return {
    name: "CreateRoute",
    setup() {
      return inject("classApp");
    },
    template,
  };
}
