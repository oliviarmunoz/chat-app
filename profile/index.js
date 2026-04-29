import { inject } from "vue";
import { ProfileView } from "../components/profile-view.js";

export default async function loadProfileRoute() {
  return fetch(new URL("./index.html", import.meta.url))
    .then((r) => r.text())
    .then((template) => ({
      name: "ProfileRoute",
      components: { ProfileView },
      setup() {
        return inject("classApp");
      },
      template,
    }));
}
