import { type RouteRecordRaw, createRouter, createWebHashHistory } from 'vue-router';
import ChargingStationsView from '@/views/ChargingStationsView.vue';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'charging-stations',
    component: ChargingStationsView,
  },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

export default router;
