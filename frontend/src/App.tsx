import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { TripProvider } from "@/context/TripProviderComposed";
import { AuthGuard } from "@/shared/components/AuthGuard";
import { V2LayoutWithMode } from "@/layouts/V2Layout";
import { AdminGuard } from "@/features/admin/AdminGuard";
import { AdminLayout } from "@/features/admin/AdminLayout";
import { ErrorBoundary } from "@/shared/components/ErrorBoundary";
import { LanguageProvider } from "@/context/LanguageContext";
import AuthPage from "@/pages/Auth";
const AuthCallbackPage = lazy(() => import("@/pages/AuthCallback"));
import { InstallPrompt } from "@/shared/components/pwa/InstallPrompt";

const ItineraryPage = lazy(() => import("@/pages/Itinerary"));
const AttractionsPage = lazy(() => import("@/pages/Attractions"));
const EventsPage = lazy(() => import("@/pages/Events"));
const EateriesPage = lazy(() => import("@/pages/Eateries"));
const POIGroupPage = lazy(() => import("@/pages/POIGroup"));
const TransportPage = lazy(() => import("@/pages/Transport"));
const SourcesPage = lazy(() => import("@/pages/Sources"));
const MapPage = lazy(() => import("@/pages/Map"));
const BudgetPage = lazy(() => import("@/pages/Budget"));
const TasksPage = lazy(() => import("@/pages/Tasks"));
const InboxPage = lazy(() => import("@/pages/Inbox"));
const AccommodationPage = lazy(() => import("@/pages/Accommodation"));
const SchedulePage = lazy(() => import("@/pages/Schedule"));
const ShareTargetPage = lazy(() => import("@/pages/ShareTarget"));
const ContactsPage = lazy(() => import("@/pages/Contacts"));
const DocumentsPage = lazy(() => import("@/pages/Documents"));
const TripsPage = lazy(() => import("@/pages/Trips"));
const OverviewPage = lazy(() => import("@/pages/Overview"));
const HomePage = lazy(() => import("@/pages/Home"));
const WeatherPage = lazy(() => import("@/pages/Weather"));
const NotFound = lazy(() => import("@/pages/NotFound"));

// V2 pages (new design)
const HomeV2Page           = lazy(() => import("@/pages/v2/HomeV2"));
const ScheduleV2Page       = lazy(() => import("@/pages/v2/ScheduleV2"));
const BudgetV2Page         = lazy(() => import("@/pages/v2/BudgetV2"));
const RecommendationsV2Page= lazy(() => import("@/pages/v2/RecommendationsV2"));
const InboxV2Page          = lazy(() => import("@/pages/v2/InboxV2"));
const TasksV2Page          = lazy(() => import("@/pages/v2/TasksV2"));
const SourcesV2Page        = lazy(() => import("@/pages/v2/SourcesV2"));
const DocumentsV2Page      = lazy(() => import("@/pages/v2/DocumentsV2"));
const AttractionsV2Page    = lazy(() => import("@/pages/v2/AttractionsV2"));
const EateriesV2Page       = lazy(() => import("@/pages/v2/EateriesV2"));
const EventsV2Page         = lazy(() => import("@/pages/v2/EventsV2"));
const AccommodationV2Page  = lazy(() => import("@/pages/v2/AccommodationV2"));
const TransportV2Page      = lazy(() => import("@/pages/v2/TransportV2"));
const ContactsV2Page       = lazy(() => import("@/pages/v2/ContactsV2"));
const TripsV2Page          = lazy(() => import("@/pages/v2/TripsV2"));
const ItineraryV2Page      = lazy(() => import("@/pages/v2/ItineraryV2"));
const MapV2Page            = lazy(() => import("@/pages/v2/MapV2"));
const WeatherV2Page        = lazy(() => import("@/pages/v2/WeatherV2"));

// Admin pages (lazy-loaded)
const AdminOverviewPage = lazy(() => import("@/pages/admin/Overview"));
const AdminPipelinePage = lazy(() => import("@/pages/admin/Pipeline"));
const AdminS3ExplorerPage = lazy(() => import("@/pages/admin/S3Explorer"));
const AdminCacheManagerPage = lazy(() => import("@/pages/admin/CacheManager"));
const AdminUsersPage = lazy(() => import("@/pages/admin/Users"));
const AdminDeadLetterQueuesPage = lazy(() => import("@/pages/admin/DeadLetterQueues"));
const AdminEmailAnalysisPage = lazy(() => import("@/pages/admin/EmailAnalysis"));
const AdminCostTrackerPage = lazy(() => import("@/pages/admin/CostTracker"));
const AdminFunnelPage = lazy(() => import("@/pages/admin/Funnel"));

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
                      <Route path="/" element={<ErrorBoundary><HomePage /></ErrorBoundary>} />
                      <Route path="/schedule" element={<ErrorBoundary><SchedulePage /></ErrorBoundary>} />
                      <Route path="/overview" element={<Navigate to="/recommendations" replace />} />
                      <Route path="/recommendations" element={<ErrorBoundary><OverviewPage /></ErrorBoundary>} />
                      <Route path="/itinerary" element={<ErrorBoundary><ItineraryPage /></ErrorBoundary>} />
                      <Route path="/attractions" element={<ErrorBoundary><AttractionsPage /></ErrorBoundary>} />
                      <Route path="/events" element={<ErrorBoundary><EventsPage /></ErrorBoundary>} />
                      <Route path="/eateries" element={<ErrorBoundary><EateriesPage /></ErrorBoundary>} />
                      <Route path="/pois" element={<Navigate to="/attractions" replace />} />
                      <Route path="/pois/group" element={<ErrorBoundary><POIGroupPage /></ErrorBoundary>} />
                      <Route path="/transport" element={<ErrorBoundary><TransportPage /></ErrorBoundary>} />
                      <Route path="/sources" element={<ErrorBoundary><SourcesPage /></ErrorBoundary>} />
                      <Route path="/sources-recommendations" element={<Navigate to="/sources" replace />} />
                      <Route path="/map" element={<ErrorBoundary><MapPage /></ErrorBoundary>} />
                      <Route path="/weather" element={<ErrorBoundary><WeatherPage /></ErrorBoundary>} />
                      <Route path="/budget" element={<ErrorBoundary><BudgetPage /></ErrorBoundary>} />
                      <Route path="/tasks" element={<ErrorBoundary><TasksPage /></ErrorBoundary>} />
                      <Route path="/inbox" element={<ErrorBoundary><InboxPage /></ErrorBoundary>} />
                      <Route path="/accommodation" element={<ErrorBoundary><AccommodationPage /></ErrorBoundary>} />
                      <Route path="/contacts" element={<ErrorBoundary><ContactsPage /></ErrorBoundary>} />
                      <Route path="/documents" element={<ErrorBoundary><DocumentsPage /></ErrorBoundary>} />
                      <Route path="/resources" element={<Navigate to="/sources" replace />} />
                      <Route path="/trips" element={<ErrorBoundary><TripsPage /></ErrorBoundary>} />
                      <Route path="/share-target" element={<ErrorBoundary><ShareTargetPage /></ErrorBoundary>} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </TripProvider>
                </AuthGuard>
              } />

              {/* ── V2 new design (parallel site) ── */}
              <Route path="/v2/*" element={
                <AuthGuard>
                  <TripProvider>
                    <V2LayoutWithMode>
                      <Routes>
                        <Route path="/" element={<ErrorBoundary><HomeV2Page /></ErrorBoundary>} />
                        <Route path="/schedule" element={<ErrorBoundary><ScheduleV2Page /></ErrorBoundary>} />
                        <Route path="/itinerary" element={<ErrorBoundary><ItineraryV2Page /></ErrorBoundary>} />
                        <Route path="/recommendations" element={<ErrorBoundary><RecommendationsV2Page /></ErrorBoundary>} />
                        <Route path="/attractions" element={<ErrorBoundary><AttractionsV2Page /></ErrorBoundary>} />
                        <Route path="/eateries" element={<ErrorBoundary><EateriesV2Page /></ErrorBoundary>} />
                        <Route path="/events" element={<ErrorBoundary><EventsV2Page /></ErrorBoundary>} />
                        <Route path="/accommodation" element={<ErrorBoundary><AccommodationV2Page /></ErrorBoundary>} />
                        <Route path="/transport" element={<ErrorBoundary><TransportV2Page /></ErrorBoundary>} />
                        <Route path="/budget" element={<ErrorBoundary><BudgetV2Page /></ErrorBoundary>} />
                        <Route path="/inbox" element={<ErrorBoundary><InboxV2Page /></ErrorBoundary>} />
                        <Route path="/tasks" element={<ErrorBoundary><TasksV2Page /></ErrorBoundary>} />
                        <Route path="/sources" element={<ErrorBoundary><SourcesV2Page /></ErrorBoundary>} />
                        <Route path="/documents" element={<ErrorBoundary><DocumentsV2Page /></ErrorBoundary>} />
                        <Route path="/contacts" element={<ErrorBoundary><ContactsV2Page /></ErrorBoundary>} />
                        <Route path="/map" element={<ErrorBoundary><MapV2Page /></ErrorBoundary>} />
                        <Route path="/weather" element={<ErrorBoundary><WeatherV2Page /></ErrorBoundary>} />
                        <Route path="/trips" element={<ErrorBoundary><TripsV2Page /></ErrorBoundary>} />
                        <Route path="*" element={<NotFound />} />
                      </Routes>
                    </V2LayoutWithMode>
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
