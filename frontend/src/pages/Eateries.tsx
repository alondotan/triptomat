import { POIsPage } from './POIs';

const EateriesPage = () => (
  <POIsPage
    allowedCategories={['eatery']}
    titleKey="eateriesPage.title"
    backTo="/overview"
  />
);

export default EateriesPage;
