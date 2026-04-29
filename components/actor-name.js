import { defineComponent } from "vue";

/**
 * Renders the current Graffiti's handle component (minus .graffiti.actor suffix).
 */
export const ActorName = defineComponent({
  name: "ActorName",
  props: {
    actor: { type: [Object, String], required: true },
    isMe: { type: Boolean, required: true },
    displayName: { type: String, default: "" },
    bold: { type: Boolean, default: false },
    /** When true, other users' names open their profile on click. */
    linkProfile: { type: Boolean, default: false },
  },
  emits: ["openProfile"],
  setup(props, { emit }) {
    function onPeerProfileClick() {
      if (!props.linkProfile || props.isMe) return;
      emit("openProfile", props.actor);
    }
    return { onPeerProfileClick };
  },
  template: `
    <template v-if="isMe">
      <strong v-if="bold">{{ displayName }}</strong>
      <template v-else>{{ displayName }}</template>
    </template>
    <span
      v-else-if="linkProfile"
      class="actor-name-link"
      role="link"
      tabindex="0"
      @click.prevent="onPeerProfileClick"
      @keydown.enter.prevent="onPeerProfileClick"
    >
      <graffiti-actor-to-handle :actor="actor" />
    </span>
    <graffiti-actor-to-handle v-else :actor="actor" />
  `,
});
