import {
  defineComponent,
  ref,
  computed,
  watch,
  inject,
  onBeforeUnmount,
} from "vue";
import { useRouter } from "vue-router";
import {
  useGraffiti,
  useGraffitiSession,
  useGraffitiDiscover,
} from "@graffiti-garden/wrapper-vue";
import {
  MEMBER_PROFILE_CHANNEL,
  memberProfileDiscoverSchema,
} from "../profile-discover.js";

function actorId(actor) {
  if (actor == null) return "";
  return typeof actor === "string" ? actor : (actor.url ?? "");
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
    const profileChannels = () => [MEMBER_PROFILE_CHANNEL];
    const { objects: profileObjects, isFirstPoll: profilesLoading } =
      useGraffitiDiscover(
        profileChannels,
        memberProfileDiscoverSchema,
        session,
        false,
      );

    const myActorId = computed(() =>
      session.value ? actorId(session.value.actor) : "",
    );

    const myLatestProfile = computed(() => {
      const s = session.value;
      if (!s) return null;
      const me = actorId(s.actor);
      const mine = profileObjects.value.filter((o) => actorId(o.actor) === me);
      if (!mine.length) return null;
      return mine.reduce((a, b) =>
        a.value.published >= b.value.published ? a : b,
      );
    });

    const isViewingClassmate = computed(
      () =>
        !!props.peerActorId &&
        props.peerActorId !== myActorId.value &&
        !props.peerResolveError,
    );

    const peerLatestProfile = computed(() => {
      if (!isViewingClassmate.value) return null;
      const pid = props.peerActorId;
      const theirs = profileObjects.value.filter(
        (o) => actorId(o.actor) === pid,
      );
      if (!theirs.length) return null;
      return theirs.reduce((a, b) =>
        a.value.published >= b.value.published ? a : b,
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
    const saveSuccess = ref(false);
    let saveSuccessClearTimer = null;

    onBeforeUnmount(() => {
      if (saveSuccessClearTimer != null) clearTimeout(saveSuccessClearTimer);
    });

    /** Edited locally; applied to the app only when "save profile" succeeds. */
    const displayNameDraft = ref("");

    watch(
      () => classApp?.myDisplayName?.value,
      (v) => {
        displayNameDraft.value = v ?? "";
      },
      { immediate: true },
    );

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
      { immediate: true },
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
        (a, b) => b.value.published - a.value.published,
      );
    });

    function startPrivateThreadWithPeer() {
      if (!classApp?.createPrivateThreadWithPeer || !props.peerActorId) return;
      void classApp.createPrivateThreadWithPeer(props.peerActorId);
    }

    const logoutConfirmOpen = ref(false);
    const logoutInProgress = ref(false);

    function openLogoutConfirm() {
      logoutConfirmOpen.value = true;
    }

    function cancelLogoutConfirm() {
      if (logoutInProgress.value) return;
      logoutConfirmOpen.value = false;
    }

    async function confirmLogout() {
      const s = session.value;
      if (!s) {
        logoutConfirmOpen.value = false;
        return;
      }
      logoutInProgress.value = true;
      try {
        await graffiti.logout(s);
      } finally {
        logoutInProgress.value = false;
        logoutConfirmOpen.value = false;
      }
    }

    watch(isViewingClassmate, (viewingPeer) => {
      if (viewingPeer) logoutConfirmOpen.value = false;
    });

    async function saveProfile() {
      const s = session.value;
      if (!s) return;
      saveInProgress.value = true;
      saveError.value = "";
      saveSuccess.value = false;
      if (saveSuccessClearTimer != null) {
        clearTimeout(saveSuccessClearTimer);
        saveSuccessClearTimer = null;
      }
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
            channels: [MEMBER_PROFILE_CHANNEL],
          },
          s,
        );
        if (classApp?.myDisplayName && classApp.persistMyDisplayName) {
          classApp.myDisplayName.value = displayNameDraft.value;
          classApp.persistMyDisplayName();
        }
        saveSuccess.value = true;
        saveSuccessClearTimer = setTimeout(() => {
          saveSuccess.value = false;
          saveSuccessClearTimer = null;
        }, 2800);
      } catch (e) {
        saveError.value = e instanceof Error ? e.message : String(e);
      } finally {
        saveInProgress.value = false;
      }
    }

    return {
      profilesLoading,
      displayNameDraft,
      availability,
      openToStudyTogether,
      openToAnswerQuestions,
      saveProfile,
      saveInProgress,
      saveError,
      saveSuccess,
      classmateRows,
      isViewingClassmate,
      peerLatestProfile,
      openClassmateProfile,
      startPrivateThreadWithPeer,
      peerDmBusy: classApp?.peerDmBusy ?? ref(false),
      peerDmError: classApp?.peerDmError ?? ref(""),
      logoutConfirmOpen,
      logoutInProgress,
      openLogoutConfirm,
      cancelLogoutConfirm,
      confirmLogout,
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
            <p v-if="peerLatestProfile.value.availability" class="profile-peer-avail">available {{ peerLatestProfile.value.availability }}</p>
            <p v-else class="muted profile-peer-empty">no availability set.</p>
            <div class="profile-peer-tags">
              <span v-if="peerLatestProfile.value.openToStudyTogether" class="profile-tag">study together</span>
              <span v-if="peerLatestProfile.value.openToAnswerQuestions" class="profile-tag">answer questions</span>
              <span v-if="!peerLatestProfile.value.openToStudyTogether && !peerLatestProfile.value.openToAnswerQuestions" class="muted">not set</span>
            </div>
          </template>
          <p v-else class="muted profile-peer-empty">no profile set!</p>
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
            <span>display name</span>
            <input
              type="text"
              v-model="displayNameDraft"
              autocomplete="nickname"
              placeholder="your Graffiti handle"
            />
          </label>
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
          <p
            v-else-if="saveSuccess"
            class="profile-save-success"
            role="status"
          >
            profile saved successfully
          </p>
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
      <footer
        v-if="!peerResolving && !isViewingClassmate"
        class="profile-account-footer"
      >
        <div class="profile-account-footer__inner form-card">
          <h2 class="profile-card-title">account</h2>
          <p class="muted profile-account-footer__hint">
            sign out on this device. you can log in again any time.
          </p>
          <button
            type="button"
            class="btn danger profile-account-footer__btn"
            @click="openLogoutConfirm"
          >
            log out
          </button>
        </div>
      </footer>
      <div
        v-if="logoutConfirmOpen && !isViewingClassmate"
        class="confirm-backdrop"
        role="presentation"
        @click.self="cancelLogoutConfirm"
      >
        <div
          class="confirm-dialog form-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-logout-title"
          aria-describedby="confirm-logout-desc"
        >
          <p id="confirm-logout-title" class="confirm-dialog__title">
            log out?
          </p>
          <p id="confirm-logout-desc" class="muted confirm-dialog__hint">
            you will leave your threads until you sign in again.
          </p>
          <div class="form-actions confirm-dialog__actions">
            <button
              type="button"
              class="btn muted-btn"
              :disabled="logoutInProgress"
              @click="cancelLogoutConfirm"
            >
              cancel
            </button>
            <button
              type="button"
              class="btn danger"
              :disabled="logoutInProgress"
              @click="confirmLogout"
            >
              {{ logoutInProgress ? "logging out..." : "log out" }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
});
