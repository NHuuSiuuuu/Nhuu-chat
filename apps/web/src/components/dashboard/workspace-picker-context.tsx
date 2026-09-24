import * as React from "react";

export interface WorkspaceOption {
  id: string;
  name: string;
  role: "owner" | "admin" | "staff";
}

export interface WorkspacePickerState {
  workspaces: WorkspaceOption[];
  activeWorkspaceId: string;
  loading: boolean;
  error: boolean;
  onSelectWorkspace: (workspaceId: string) => void;
}

const WorkspacePickerContext = React.createContext<WorkspacePickerState | null>(null);

export function useWorkspacePicker(): WorkspacePickerState | null {
  return React.useContext(WorkspacePickerContext);
}

export function WorkspacePickerProvider({ value, children }: { value: WorkspacePickerState | null; children: React.ReactNode }) {
  return <WorkspacePickerContext.Provider value={value}>{children}</WorkspacePickerContext.Provider>;
}
