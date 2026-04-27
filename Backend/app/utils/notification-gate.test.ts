import { describe, expect, it } from "vitest";
import {
  contentMentionsUsername,
  shouldEmitNotificationPush,
} from "./notification-gate";

describe("shouldEmitNotificationPush", () => {
  const base = {
    recipientUsername: "alice",
    messageContent: "hello",
    recipientUserId: "u1",
  };

  it("ALL_MESSAGES always pushes", () => {
    expect(
      shouldEmitNotificationPush({
        ...base,
        level: "ALL_MESSAGES",
        parentMessageSenderId: null,
      }),
    ).toBe(true);
  });

  it("NOTHING never pushes", () => {
    expect(
      shouldEmitNotificationPush({
        ...base,
        level: "NOTHING",
        parentMessageSenderId: null,
      }),
    ).toBe(false);
  });

  it("MENTIONS_AND_REPLIES pushes on reply to recipient", () => {
    expect(
      shouldEmitNotificationPush({
        ...base,
        level: "MENTIONS_AND_REPLIES",
        parentMessageSenderId: "u1",
      }),
    ).toBe(true);
  });

  it("MENTIONS_AND_REPLIES pushes on @username boundary", () => {
    expect(
      shouldEmitNotificationPush({
        ...base,
        level: "MENTIONS_AND_REPLIES",
        parentMessageSenderId: null,
        messageContent: "hey @alice there",
      }),
    ).toBe(true);
  });

  it("MENTIONS_AND_REPLIES ignores substring without boundary", () => {
    expect(
      shouldEmitNotificationPush({
        ...base,
        level: "MENTIONS_AND_REPLIES",
        parentMessageSenderId: null,
        messageContent: "not@alice valid",
      }),
    ).toBe(false);
  });
});

describe("contentMentionsUsername", () => {
  it("matches start of string", () => {
    expect(contentMentionsUsername("@bob hi", "bob")).toBe(true);
  });

  it("is case-insensitive for mention", () => {
    expect(contentMentionsUsername("Hi @BOB", "bob")).toBe(true);
  });

  it("requires terminator after username", () => {
    expect(contentMentionsUsername("hi @bobby", "bob")).toBe(false);
  });
});
