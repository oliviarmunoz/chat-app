import { defineComponent, computed, inject } from "vue";

/**
 * One preview line per thread card. Subscribes only to that thread’s channel
 * preview string, so updates on other threads do not re-render this block.
 */
export const ThreadCardPreview = defineComponent({
  name: "ThreadCardPreview",
  props: {
    thread: { type: Object, required: true },
  },
  setup(props) {
    const app = inject("classApp");
    const previewText = computed(() => app.previewTextForThread(props.thread));
    return { previewText };
  },
  template: `
    <p
      v-if="previewText"
      class="preview"
      :title="previewText"
    >
      “{{ previewText }}”
    </p>
  `,
});
