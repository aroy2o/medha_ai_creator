import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export interface FeedPost {
  id: string;
  createdAt: string;
  text: string;
  rationale: string;
  sources: string[];
  /** Bonus fields beyond the required contract — optional so this type
   * still matches a strictly-spec-compliant feed response. */
  topicTags?: string[];
  stance?: string;
}

interface FeedState {
  posts: FeedPost[];
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
  lastFetchedAt: string | null;
}

const initialState: FeedState = {
  posts: [],
  status: "idle",
  error: null,
  lastFetchedAt: null,
};

const feedSlice = createSlice({
  name: "feed",
  initialState,
  reducers: {
    fetchStarted(state) {
      state.status = "loading";
      state.error = null;
    },
    fetchSucceeded(state, action: PayloadAction<FeedPost[]>) {
      state.status = "succeeded";
      state.posts = action.payload;
      state.lastFetchedAt = new Date().toISOString();
    },
    fetchFailed(state, action: PayloadAction<string>) {
      state.status = "failed";
      state.error = action.payload;
    },
  },
});

export const { fetchStarted, fetchSucceeded, fetchFailed } = feedSlice.actions;
export default feedSlice.reducer;
