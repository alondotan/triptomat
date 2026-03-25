import { POIsPage } from './POIs';

const AttractionsPage = () => (
  <POIsPage
    allowedCategories={['attraction', 'service']}
    titleKey="attractionsPage.title"
    backTo="/overview"
  />
);

export default AttractionsPage;
