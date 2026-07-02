import * as React from "react";
import { AlertTriangle } from "lucide-react";

import { ErrorState } from "@/shared/states/ErrorState";

export interface ExplorerErrorStateProps extends React.ComponentProps<typeof ErrorState> {}

export function ExplorerErrorState({
  title = "目录读取失败",
  description = "请刷新后重试，或检查当前路径是否仍然可访问。",
  icon = <AlertTriangle />,
  ...props
}: ExplorerErrorStateProps) {
  return <ErrorState title={title} description={description} icon={icon} {...props} />;
}
