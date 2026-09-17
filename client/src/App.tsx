import { Route, Switch, Router, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import KioskShell from "@/components/KioskShell";
import Idle from "@/pages/Idle";
import PilihPaket from "@/pages/PilihPaket";
import PilihOrientasi from "@/pages/PilihOrientasi";
import Pembayaran from "@/pages/Pembayaran";
import SesiFoto from "@/pages/SesiFoto";
import PreviewFoto from "@/pages/PreviewFoto";
import PilihFrame from "@/pages/PilihFrame";
import Hasil from "@/pages/Hasil";
import AdminPlaceholder from "@/pages/AdminPlaceholder";
import ShareGallery from "@/pages/ShareGallery";
import CustomerManagement from "@/pages/CustomerManagement";
import AdminDashboard from "@/pages/AdminDashboard";
import FrameManagement from "@/pages/FrameManagement";
import { AnimatePresence, motion } from "framer-motion";

function AnimatedRoutes() {
  const [location] = useLocation();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location}
        className="h-full w-full"
        initial={{ opacity: 0, y: 10, filter: "blur(3px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        exit={{ opacity: 0, y: -8, filter: "blur(3px)" }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      >
        <Switch>
          <Route path="/" component={Idle} />
          <Route path="/paket" component={PilihPaket} />
          <Route path="/orientasi" component={PilihOrientasi} />
          <Route path="/bayar" component={Pembayaran} />
          <Route path="/sesi-foto" component={SesiFoto} />
          <Route path="/preview" component={PreviewFoto} />
          <Route path="/frame" component={PilihFrame} />
          <Route path="/hasil" component={Hasil} />
          <Route path="/admin" component={AdminDashboard} />
          <Route path="/admin/customers" component={CustomerManagement} />
          <Route path="/admin/frames" component={FrameManagement} />
          <Route path="/admin/customizer">{() => { window.location.hash = "#/admin"; return null; }}</Route>
          <Route path="/share/:id">{(params) => <ShareGallery id={params.id} />}</Route>
          <Route>
            <div className="flex h-full items-center justify-center text-white/50">Halaman tidak ditemukan</div>
          </Route>
        </Switch>
      </motion.div>
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <KioskShell>
      <Router hook={useHashLocation}>
        <AnimatedRoutes />
      </Router>
    </KioskShell>
  );
}
