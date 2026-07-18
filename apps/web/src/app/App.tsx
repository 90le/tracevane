import { AppProviders } from "@/app/providers";
import { AppRouter } from "@/app/router";
import { AuthGate } from "@/features/auth/AuthGate";

export function App() {
  return (
    <AppProviders>
      <AuthGate>
        <AppRouter />
      </AuthGate>
    </AppProviders>
  );
}
