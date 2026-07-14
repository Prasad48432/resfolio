import {
  initSentryClient,
  onRouterTransitionStart as sentryTransitionStart,
} from "@resfolio/observability/sentry-client";

initSentryClient();

export const onRouterTransitionStart = sentryTransitionStart;
