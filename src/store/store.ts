import { configureStore } from "@reduxjs/toolkit";
import feedReducer from "./slices/feedSlice";

export function makeStore() {
  return configureStore({
    reducer: {
      feed: feedReducer,
    },
  });
}

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
