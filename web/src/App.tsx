import { WalletProvider } from "./hooks/useWallet";
import { ToastProvider } from "./hooks/useToasts";
import { Toasts } from "./components/Toasts";
import { FeedbackWidget } from "./components/FeedbackWidget";
import { Console } from "./console/Console";

export default function App() {
  return (
    <ToastProvider>
      <WalletProvider>
        <Console />
        <Toasts />
        <FeedbackWidget />
      </WalletProvider>
    </ToastProvider>
  );
}
