import { createSlice, PayloadAction } from "@reduxjs/toolkit"

interface UIState {
  globalFilterSP: string
  globalFilterCountry: string
  buyerSegment: string
  buyerTier: string
  search: string
  fy: string
  variety: string
  fyMonth: string
  fyWeek: string
  fyQuarter: string
  sidebarOpen: boolean
}

const initialState: UIState = {
  globalFilterSP: "",
  globalFilterCountry: "",
  buyerSegment: "ALL",
  buyerTier: "ALL",
  search: "",
  fy: "",
  variety: "",
  fyMonth: "",
  fyWeek: "",
  fyQuarter: "",
  sidebarOpen: true,
}

export const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    setGlobalFilterSP: (state, action: PayloadAction<string>) => {
      state.globalFilterSP = action.payload
    },
    setGlobalFilterCountry: (state, action: PayloadAction<string>) => {
      state.globalFilterCountry = action.payload
    },
    setBuyerSegment: (state, action: PayloadAction<string>) => {
      state.buyerSegment = action.payload
    },
    setBuyerTier: (state, action: PayloadAction<string>) => {
      state.buyerTier = action.payload
    },
    setSearch: (state, action: PayloadAction<string>) => {
      state.search = action.payload
    },
    setFY: (state, action: PayloadAction<string>) => {
      state.fy = action.payload
    },
    setVariety: (state, action: PayloadAction<string>) => {
      state.variety = action.payload
    },
    setFYMonth: (state, action: PayloadAction<string>) => {
      state.fyMonth = action.payload
    },
    setFYWeek: (state, action: PayloadAction<string>) => {
      state.fyWeek = action.payload
    },
    setFYQuarter: (state, action: PayloadAction<string>) => {
      state.fyQuarter = action.payload
    },
    toggleSidebar: (state) => {
      state.sidebarOpen = !state.sidebarOpen
    },
    setSidebarOpen: (state, action: PayloadAction<boolean>) => {
      state.sidebarOpen = action.payload
    },
  },
})

export const {
  setGlobalFilterSP,
  setGlobalFilterCountry,
  setBuyerSegment,
  setBuyerTier,
  setSearch,
  setFY,
  setVariety,
  setFYMonth,
  setFYWeek,
  setFYQuarter,
  toggleSidebar,
  setSidebarOpen,
} = uiSlice.actions

export default uiSlice.reducer
