import { POIsPage } from './POIs';

const EventsPage = () => (
  <POIsPage
    allowedCategories={['event']}
    titleKey="eventsPage.title"
    backTo="/overview"
  />
);

export default EventsPage;
