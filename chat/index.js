import { inject } from "vue";
import { ActorName } from "../components/actor-name.js";

export default async function loadChatRoute() {
  const template = await fetch(new URL("./index.html", import.meta.url)).then((r) => r.text());
  return {
    name: "ChatRoute",
    components: { ActorName },
    setup() {
      return inject("classApp");
    },
    template,
  };
}
