import * as React from "react";
import { FolderOpen } from "lucide-react";

import { EmptyState } from "@/shared/states/EmptyState";

export interface ExplorerEmptyStateProps extends React.ComponentProps<typeof EmptyState> {}

export function ExplorerEmptyState({
  title = "目录为空",
  description = "这里还没有可显示的文件或文件夹。",
  icon = <FolderOpen />,
  ...props
}: ExplorerEmptyStateProps) {
  return <EmptyState title={title} description={description} icon={icon} {...props} />;
}
