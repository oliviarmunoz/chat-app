import { inject, ref, watch, nextTick, onMounted } from "vue";
import { ActorName } from "../components/actor-name.js";
import { ChatTimelineList } from "../components/chat-timeline-list.js";

function scrollTimelineToBottom(el) {
  if (!el) return;
  el.scrollTop = el.scrollHeight;
}

function timelineScrollRoot(timelineRef) {
  const v = timelineRef?.value;
  if (!v) return null;
  return v.$el ?? v;
}

export default async function loadChatRoute() {
  const template = await fetch(new URL("./index.html", import.meta.url)).then((r) => r.text());
  return {
    name: "ChatRoute",
    components: { ActorName, ChatTimelineList },
    setup() {
      const classApp = inject("classApp");
      const timelineEl = ref(null);
      const composeInput = ref(null);

      async function sendMessage() {
        await classApp.sendMessage();
        await nextTick();
        composeInput.value?.focus();
      }

      function scrollToBottom() {
        scrollTimelineToBottom(timelineScrollRoot(timelineEl));
      }

      watch(
        () => classApp.timeline.value,
        () => {
          scrollToBottom();
        },
        { flush: "post" },
      );

      watch(
        () => classApp.timelineLoading.value,
        (loading) => {
          if (!loading) nextTick(scrollToBottom);
        },
        { flush: "post" },
      );

      onMounted(() => {
        nextTick(scrollToBottom);
      });

      return {
        ...classApp,
        sendMessage,
        timelineEl,
        composeInput,
      };
    },
    template,
  };
}
