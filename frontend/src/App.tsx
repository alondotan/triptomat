import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { TripProvider } from "./context/TripProviderComposed";
import { AuthGuard } from "./components/AuthGuard";
import { AdminGuard } from "./components/admin/AdminGuard";
import { AdminLayout } from "./components/admin/AdminLayout";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { LanguageProvider } from "./context/LanguageContext";
import AuthPage from "./pages/Auth";
const AuthCallbackPage = lazy(() => import("./pages/AuthCallback"));
import { InstallPrompt } from "./components/pwa/InstallPrompt";

const ItineraryPage = lazy(() => import("./pages/Itinerary"));
const POIsPage = lazy(() => import("./pages/POIs"));
const POIGroupPage = lazy(() => import("./pages/POIGroup"));
const TransportPage = lazy(() => import("./pages/Transport"));
const RecommendationsPage = lazy(() => import("./pages/Recommendations"));
const MapPage = lazy(() => import("./pages/Map"));
const BudgetPage = lazy(() => import("./pages/Budget"));
const TasksPage = lazy(() => import("./pages/Tasks"));
const InboxPage = lazy(() => import("./pages/Inbox"));
const AccommodationPage = lazy(() => import("./pages/Accommodation"));
const SchedulePage = lazy(() => import("./pages/Schedule"));
const ShareTargetPage = lazy(() => import("./pages/ShareTarget"));
const ContactsPage = lazy(() => import("./pages/Contacts"));
const TripsPage = lazy(() => import("./pages/Trips"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Admin pages (lazy-loaded)
const AdminOverviewPage = lazy(() => import("./pages/admin/Overview"));
const AdminPipelinePage = lazy(() => import("./pages/admin/Pipeline"));
const AdminS3ExplorerPage = lazy(() => import("./pages/admin/S3Explorer"));
const AdminCacheManagerPage = lazy(() => import("./pages/admin/CacheManager"));
const AdminUsersPage = lazy(() => import("./pages/admin/Users"));
const AdminDeadLetterQueuesPage = lazy(() => import("./pages/admin/DeadLetterQueues"));
const AdminEmailAnalysisPage = lazy(() => import("./pages/admin/EmailAnalysis"));
const AdminCostTrackerPage = lazy(() => import("./pages/admin/CostTracker"));
const AdminFunnelPage = lazy(() => import("./pages/admin/Funnel"));

const queryClient = new QueryClient();

const App = () => (
  <ErrorBoundary>
    <LanguageProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <InstallPrompt />
        <BrowserRouter>
          <Suspense fallback={<div className="flex items-center justify-center h-screen"><Loader2 className="animate-spin h-8 w-8" /></div>}>
            <Routes>
              <Route path="/auth" element={<ErrorBoundary><AuthPage /></ErrorBoundary>} />
              <Route path="/auth/callback" element={<ErrorBoundary><AuthCallbackPage /></ErrorBoundary>} />
              <Route path="/admin/*" element={
                <AdminGuard>
                  <AdminLayout>
                    <Routes>
                      <Route path="/" element={<ErrorBoundary><AdminOverviewPage /></ErrorBoundary>} />
                      <Route path="/pipeline" element={<ErrorBoundary><AdminPipelinePage /></ErrorBoundary>} />
                      <Route path="/s3" element={<ErrorBoundary><AdminS3ExplorerPage /></ErrorBoundary>} />
                      <Route path="/cache" element={<ErrorBoundary><AdminCacheManagerPage /></ErrorBoundary>} />
                      <Route path="/users" element={<ErrorBoundary><AdminUsersPage /></ErrorBoundary>} />
                      <Route path="/dlq" element={<ErrorBoundary><AdminDeadLetterQueuesPage /></ErrorBoundary>} />
                      <Route path="/emails" element={<ErrorBoundary><AdminEmailAnalysisPage /></ErrorBoundary>} />
                      <Route path="/costs" element={<ErrorBoundary><AdminCostTrackerPage /></ErrorBoundary>} />
                      <Route path="/funnel" element={<ErrorBoundary><AdminFunnelPage /></ErrorBoundary>} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </AdminLayout>
                </AdminGuard>
              } />
              <Route path="/*" element={
                <AuthGuard>
                  <TripProvider>
                    <Routes>
                      <Route path="/" element={<ErrorBoundary><SchedulePage /></ErrorBoundary>} />
                      <Route path="/itinerary" element={<ErrorBoundary><ItineraryPage /></ErrorBoundary>} />
                      <Route path="/pois" element={<ErrorBoundary><POIsPage /></ErrorBoundary>} />
                      <Route path="/pois/group" element={<ErrorBoundary><POIGroupPage /></ErrorBoundary>} />
                      <Route path="/transport" element={<ErrorBoundary><TransportPage /></ErrorBoundary>} />
                      <Route path="/recommendations" element={<ErrorBoundary><RecommendationsPage /></ErrorBoundary>} />
                      <Route path="/map" element={<ErrorBoundary><MapPage /></ErrorBoundary>} />
                      <Route path="/budget" element={<ErrorBoundary><BudgetPage /></ErrorBoundary>} />
                      <Route path="/tasks" element={<ErrorBoundary><TasksPage /></ErrorBoundary>} />
                      <Route path="/inbox" element={<ErrorBoundary><InboxPage /></ErrorBoundary>} />
                      <Route path="/accommodation" element={<ErrorBoundary><AccommodationPage /></ErrorBoundary>} />
                      <Route path="/contacts" element={<ErrorBoundary><ContactsPage /></ErrorBoundary>} />
                      <Route path="/trips" element={<ErrorBoundary><TripsPage /></ErrorBoundary>} />
                      <Route path="/share-target" element={<ErrorBoundary><ShareTargetPage /></ErrorBoundary>} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </TripProvider>
                </AuthGuard>
              } />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
    </LanguageProvider>
  </ErrorBoundary>
);

export default App;
