"use client";

import { createAuthClient } from "better-auth/react";

/** Browser auth client. Same-origin requests to /api/auth. */
export const authClient = createAuthClient();
