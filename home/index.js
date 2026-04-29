import { inject } from "vue";
import { ActorName } from "../components/actor-name.js";

export default async function loadHomeRoute() {
  const template = await fetch(new URL("./index.html", import.meta.url)).then((r) => r.text());
  return {
    name: "HomeRoute",
    components: { ActorName },
    setup() {
      return inject("classApp");
    },
    template,
  };
}
