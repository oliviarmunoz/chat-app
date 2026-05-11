/** Graffiti channel for class member profile updates (one class for now). */
export const MEMBER_PROFILE_CHANNEL = "mit:class:6.4500:profiles";

/** Schema for `useGraffitiDiscover` on {@link MEMBER_PROFILE_CHANNEL}. */
export const memberProfileDiscoverSchema = {
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
