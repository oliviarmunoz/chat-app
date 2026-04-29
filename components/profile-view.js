import { defineComponent, ref, computed, watch, inject } from "vue";
import { useRouter } from "vue-router";
import {
  useGraffiti,
  useGraffitiSession,
  useGraffitiDiscover,
} from "@graffiti-garden/wrapper-vue";

const PROFILE_CHANNEL = "mit:class:6.4500:profiles"; // only supporting one class for now

const memberProfileSchema = {
  properties: {
    value: {
      required: [
        "activity",
        "type",
        "classId",
        "published",
        "availability",
        "openToStudyTogether",
        "openToAnswerQuestions",
      ],
      properties: {
        activity: { const: "Update" },
        type: { const: "MemberProfile" },
        classId: { const: "6.4500" },
        availability: { type: "string" },
        openToStudyTogether: { type: "boolean" },
        openToAnswerQuestions: { type: "boolean" },
        published: { type: "number" },
      },
    },
  },
};

function actorId(actor) {
  if (actor == null) return "";
  return typeof actor === "string" ? actor : actor.url ?? "";
}

const GRAFFITI_ACTOR_SUFFIX = ".graffiti.actor";

// Remove the .graffiti.actor suffix from the actor ID
function stripGraffitiActorSuffix(s) {
  if (s == null || s === "") return "";
  let t = String(s).trim();
  if (!t) return "";
  try {
    if (t.includes("://")) {
      const u = new URL(t);
      t = u.hostname || t;
    }
  } catch {
    /* keep t */
  }
  if (t.endsWith(GRAFFITI_ACTOR_SUFFIX)) {
    return t.slice(0, -GRAFFITI_ACTOR_SUFFIX.length);
  }
  return "";
}

function shortActorLabel(aid) {
  if (!aid) return "?";
  const stripped = stripGraffitiActorSuffix(aid);
  if (stripped) return stripped;
  try {
    const tail = new URL(aid).pathname.split("/").filter(Boolean).pop();
    return tail || aid.slice(-10);
  } catch {
    return aid.slice(-10);
  }
}

export const ProfileView = defineComponent({
  name: "ProfileView",
  props: {
    peerActorId: { type: String, default: "" },
    peerResolveError: { type: String, default: "" },
    peerResolving: { type: Boolean, default: false },
  },
  setup(props) {
    const graffiti = useGraffiti();
    const session = useGraffitiSession();
    const router = useRouter();
    const classApp = inject("classApp", null);
    const profileChannels = () => [PROFILE_CHANNEL];
    const { objects: profileObjects, isFirstPoll: profilesLoading } =
      useGraffitiDiscover(profileChannels, memberProfileSchema, session, false);

    const myActorId = computed(() =>
      session.value ? actorId(session.value.actor) : ""
    );

    const myLatestProfile = computed(() => {
      const s = session.value;
      if (!s) return null;
      const me = actorId(s.actor);
      const mine = profileObjects.value.filter((o) => actorId(o.actor) === me);
      if (!mine.length) return null;
      return mine.reduce((a, b) =>
        a.value.published >= b.value.published ? a : b
      );
    });

    const isViewingClassmate = computed(
      () =>
        !!props.peerActorId &&
        props.peerActorId !== myActorId.value &&
        !props.peerResolveError
    );

    const peerLatestProfile = computed(() => {
      if (!isViewingClassmate.value) return null;
      const pid = props.peerActorId;
      const theirs = profileObjects.value.filter(
        (o) => actorId(o.actor) === pid
      );
      if (!theirs.length) return null;
      return theirs.reduce((a, b) =>
        a.value.published >= b.value.published ? a : b
      );
    });

    async function openClassmateProfile(actor) {
      let slug = shortActorLabel(actorId(actor));
      try {
        const h = await graffiti.actorToHandle(actor);
        if (h != null && String(h).trim()) {
          const raw = String(h).trim();
          slug = stripGraffitiActorSuffix(raw) || raw || slug;
        }
      } catch {}
      router.push({ name: "profileUser", params: { username: slug } });
    }

    const availability = ref("");
    const openToStudyTogether = ref(false);
    const openToAnswerQuestions = ref(false);
    const saveInProgress = ref(false);
    const saveError = ref("");

    watch(
      myLatestProfile,
      (obj) => {
        if (saveInProgress.value) return;
        if (!obj) {
          availability.value = "";
          openToStudyTogether.value = false;
          openToAnswerQuestions.value = false;
          return;
        }
        availability.value = obj.value.availability ?? "";
        openToStudyTogether.value = !!obj.value.openToStudyTogether;
        openToAnswerQuestions.value = !!obj.value.openToAnswerQuestions;
      },
      { immediate: true }
    );

    const classmateRows = computed(() => {
      const s = session.value;
      if (!s) return [];
      const me = actorId(s.actor);
      const byActor = new Map();
      for (const o of profileObjects.value) {
        const aid = actorId(o.actor);
        if (!aid || aid === me) continue;
        const prev = byActor.get(aid);
        if (!prev || o.value.published > prev.value.published) {
          byActor.set(aid, o);
        }
      }
      return [...byActor.values()].toSorted(
        (a, b) => b.value.published - a.value.published
      );
    });

    function startPrivateThreadWithPeer() {
      if (!classApp?.createPrivateThreadWithPeer || !props.peerActorId) return;
      void classApp.createPrivateThreadWithPeer(props.peerActorId);
    }

    async function saveProfile() {
      const s = session.value;
      if (!s) return;
      saveInProgress.value = true;
      saveError.value = "";
      try {
        await graffiti.post(
          {
            value: {
              activity: "Update",
              type: "MemberProfile",
              classId: "6.4500",
              availability: availability.value.trim(),
              openToStudyTogether: openToStudyTogether.value,
              openToAnswerQuestions: openToAnswerQuestions.value,
              published: Date.now(),
            },
            channels: [PROFILE_CHANNEL],
          },
          s
        );
      } catch (e) {
        saveError.value = e instanceof Error ? e.message : String(e);
      } finally {
        saveInProgress.value = false;
      }
    }

    return {
      profilesLoading,
      availability,
      openToStudyTogether,
      openToAnswerQuestions,
      saveProfile,
      saveInProgress,
      saveError,
      classmateRows,
      isViewingClassmate,
      peerLatestProfile,
      openClassmateProfile,
      startPrivateThreadWithPeer,
      peerDmBusy: classApp?.peerDmBusy ?? ref(false),
      peerDmError: classApp?.peerDmError ?? ref(""),
    };
  },
  template: `
    <div class="profile-page">
      <p v-if="peerResolving" class="muted profile-loading"><em>searching for user...</em></p>
      <p v-else-if="peerResolveError" class="create-error profile-peer-error">{{ peerResolveError }}</p>
      <template v-else-if="isViewingClassmate">
        <p v-if="profilesLoading" class="muted profile-loading"><em>loading profile data...</em></p>
        <div v-else class="form-card profile-peer-readonly">
          <div class="profile-peer-name profile-peer-readonly-handle">
            <graffiti-actor-to-handle :actor="peerLatestProfile ? peerLatestProfile.actor : peerActorId" />
          </div>
          <template v-if="peerLatestProfile">
            <p v-if="peerLatestProfile.value.availability" class="profile-peer-avail">{{ peerLatestProfile.value.availability }}</p>
            <p v-else class="muted profile-peer-empty">No availability text.</p>
            <div class="profile-peer-tags">
              <span v-if="peerLatestProfile.value.openToStudyTogether" class="profile-tag">Study together</span>
              <span v-if="peerLatestProfile.value.openToAnswerQuestions" class="profile-tag">Questions</span>
              <span v-if="!peerLatestProfile.value.openToStudyTogether && !peerLatestProfile.value.openToAnswerQuestions" class="muted">Not set</span>
            </div>
          </template>
          <p v-else class="muted profile-peer-empty">No profile set!</p>
          <p v-if="peerDmError" class="create-error profile-peer-dm-error">{{ peerDmError }}</p>
          <div class="form-actions profile-peer-dm-actions">
            <button
              type="button"
              class="btn primary"
              :disabled="peerDmBusy"
              @click="startPrivateThreadWithPeer"
            >
              {{ peerDmBusy ? "creating..." : "start private thread" }}
            </button>
          </div>
        </div>
      </template>
      <p v-else-if="profilesLoading" class="muted profile-loading"><em>loading profile data...</em></p>
      <template v-else>
        <div class="form-card">
          <label class="field">
            <span>availability</span>
            <textarea
              v-model="availability"
              rows="3"
              placeholder="e.g. weekday evenings after 6pm, sunday afternoons"
            ></textarea>
          </label>
          <div class="profile-open-to">
            <span class="profile-open-to-label">open to</span>
            <label class="profile-check">
              <input type="checkbox" v-model="openToStudyTogether" />
              <span>studying together</span>
            </label>
            <label class="profile-check">
              <input type="checkbox" v-model="openToAnswerQuestions" />
              <span>answering questions</span>
            </label>
          </div>
          <p v-if="saveError" class="create-error">{{ saveError }}</p>
          <div class="form-actions profile-save-row">
            <button
              type="button"
              class="btn primary"
              :disabled="saveInProgress"
              @click="saveProfile"
            >
              {{ saveInProgress ? "saving..." : "save profile" }}
            </button>
          </div>
        </div>
      </template>
    </div>
  `,
});
