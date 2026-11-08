import { useEffect } from "react";
import { useLocation } from "wouter";
import { useBoothConfig } from "./boothConfigStore";
import { useKioskSession } from "./sessionStore";
import { getNextRoute } from "./kioskFlow";

/**
 * Screens before the payment (packages, camera view, payment) must not be reachable once the payment has cleared:
 * going back there used to drop a customer who had already paid all the way to the idle screen, losing the session.
 * Landing on one of them anyway sends the customer straight on to the step after payment.
 */
export function usePaidGuard() {
  const [, navigate] = useLocation();
  const paymentDone = useKioskSession((s) => s.paymentDone);
  const flow = useBoothConfig((s) => s.config.kioskFlow);
  useEffect(() => {
    if (!paymentDone) return;
    navigate(getNextRoute("payment", flow), { replace: true });
  }, [paymentDone, flow, navigate]);
}
