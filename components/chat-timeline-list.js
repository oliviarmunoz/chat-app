import { defineComponent, inject } from "vue";
import { ActorName } from "./actor-name.js";

/**
 * Timeline list isolated from compose / thread chrome so typing in the draft
 * input does not re-render every message row.
 */
export const ChatTimelineList = defineComponent({
  name: "ChatTimelineList",
  components: { ActorName },
  setup() {
    const classApp = inject("classApp");
    return {
      timeline: classApp.timeline,
      deletingMessages: classApp.deletingMessages,
      myDisplayName: classApp.myDisplayName,
      isMe: classApp.isMe,
      goProfileForActor: classApp.goProfileForActor,
      ownMessagePendingDelete: classApp.ownMessagePendingDelete,
      ownMessageDeleteSecondsLeft: classApp.ownMessageDeleteSecondsLeft,
      deleteOwnMessage: classApp.deleteOwnMessage,
      undoOwnMessageDelete: classApp.undoOwnMessageDelete,
    };
  },
  template: `
    <ul class="timeline">
      <li
        v-for="item in timeline"
        :key="item.url"
        :class="
          item.kind === 'join' || item.kind === 'leave' ? 'sys' : 'msg'
        "
      >
        <template v-if="item.kind === 'join'">
          &lt; —-
          <actor-name
            :actor="item.actor"
            :is-me="isMe(item.actor)"
            :display-name="myDisplayName"
            link-profile
            @open-profile="goProfileForActor"
          ></actor-name>
          joined the thread! -— &gt;
        </template>
        <template v-else-if="item.kind === 'leave'">
          &lt; —- {{ myDisplayName }} has left the thread! -— &gt;
        </template>
        <template v-else>
          <div class="msg-row">
            <span
              v-if="ownMessagePendingDelete(item)"
              class="msg-body msg-body--pending-delete"
            >
              <span class="msg-deleted-note">you deleted this message.</span>
              <span class="msg-delete-undo-row">
                <button
                  type="button"
                  class="btn small msg-delete-undo"
                  @click="undoOwnMessageDelete(item)"
                >
                  undo
                </button>
                <span
                  class="msg-delete-countdown"
                  :aria-label="
                    ownMessageDeleteSecondsLeft(item) +
                    ' seconds until permanent delete'
                  "
                  >{{ ownMessageDeleteSecondsLeft(item) }}s</span
                >
              </span>
            </span>
            <span
              v-else-if="isMe(item.actor) && deletingMessages.has(item.url)"
              class="msg-body msg-body--pending-delete"
            >
              <span class="msg-deleted-note">deleting...</span>
            </span>
            <span v-else class="msg-body">
              <actor-name
                :actor="item.actor"
                :is-me="isMe(item.actor)"
                :display-name="myDisplayName"
                bold
                link-profile
                @open-profile="goProfileForActor"
              ></actor-name
              >: {{ item.value.content }}
            </span>
            <button
              v-if="
                isMe(item.actor) &&
                !ownMessagePendingDelete(item) &&
                !deletingMessages.has(item.url)
              "
              type="button"
              class="btn small danger msg-delete msg-delete-icon"
              :disabled="deletingMessages.has(item.url)"
              aria-label="Delete message"
              @click="deleteOwnMessage(item)"
            >
              <span
                v-if="deletingMessages.has(item.url)"
                class="msg-delete-loading"
                aria-hidden="true"
                >deleting ...</span
              >
              <img
                v-else
                src="images/delete.png"
                alt=""
                class="msg-delete__pic"
                width="28"
                height="28"
              />
            </button>
          </div>
        </template>
      </li>
    </ul>
  `,
});
