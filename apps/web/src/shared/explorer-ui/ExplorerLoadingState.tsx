import * as React from "react";

import { LoadingState } from "@/shared/states/LoadingState";

export interface ExplorerLoadingStateProps extends React.ComponentProps<typeof LoadingState> {}

export function ExplorerLoadingState({
  title = "正在读取目录",
  description = "请稍候，文件树正在加载。",
  ...props
}: ExplorerLoadingStateProps) {
  return <LoadingState title={title} description={description} {...props} />;
}
