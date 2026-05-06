import { inject } from "vue";
import { ActorName } from "../components/actor-name.js";

export default async function loadMyThreadsRoute() {
  const template = await fetch(new URL("./index.html", import.meta.url)).then((r) =>
    r.text(),
  );
  return {
    name: "MyThreadsRoute",
    components: { ActorName },
    setup() {
      return inject("classApp");
    },
    template,
  };
}
