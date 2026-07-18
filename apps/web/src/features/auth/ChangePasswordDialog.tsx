import * as React from "react";

import { Button } from "@/design/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/design/ui/dialog";
import { Input } from "@/design/ui/input";
import { toast } from "@/design/ui/sonner";
import { isApiError } from "@/lib/api/errors";

import { changeAuthPassword } from "./api";

/**
 * Set/change the standalone unlock password from the UI. The server requires
 * the current session plus the current credential (access token or current
 * password); on success it re-issues the session cookie, so this browser
 * stays unlocked while other sessions are invalidated.
 */
export function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [currentCredential, setCurrentCredential] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const reset = () => {
    setCurrentCredential("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
    setSubmitting(false);
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    if (!newPassword.trim()) {
      setError("新密码不能为空");
      return;
    }
    if (newPassword.length > 128) {
      setError("新密码长度不能超过 128 个字符");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("两次输入的新密码不一致");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await changeAuthPassword(currentCredential, newPassword);
      toast.success("密码已更新", {
        description: "其他设备的登录状态已失效，当前浏览器保持登录。",
      });
      onOpenChange(false);
      reset();
    } catch (err) {
      setError(
        isApiError(err) && err.code === "auth_invalid_credential"
          ? "当前密码或访问令牌不正确"
          : isApiError(err) && err.code === "auth_invalid_password"
            ? err.message
            : "修改失败，请稍后重试",
      );
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>修改密码</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <DialogBody>
            <div className="grid gap-3">
              <label className="grid gap-1.5 text-sm text-muted">
                当前密码或访问令牌
                <Input
                  type="password"
                  value={currentCredential}
                  onChange={(e) => setCurrentCredential(e.target.value)}
                  placeholder="验证当前身份"
                  autoComplete="current-password"
                  required
                />
              </label>
              <label className="grid gap-1.5 text-sm text-muted">
                新密码
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="不超过 128 个字符"
                  autoComplete="new-password"
                  required
                />
              </label>
              <label className="grid gap-1.5 text-sm text-muted">
                确认新密码
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </label>
              {error ? (
                <p role="alert" className="text-sm text-danger">{error}</p>
              ) : null}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              取消
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={submitting}>
              {submitting ? "保存中…" : "保存密码"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
