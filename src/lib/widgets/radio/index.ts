import type { WidgetDef } from '../../core/types';
import Radio from './Radio.svelte';

const widget: WidgetDef = {
  id: 'radio',
  title: 'Radio',
  description: 'Free live radio stations (FIP, KEXP, Radio Paradise, NTS), drawn in your theme. Also in the status bar.',
  icon: '♪',
  component: Radio,
  keywords: ['music', 'radio', 'stream', 'live', 'fip', 'kexp', 'nts', 'paradise', 'player'],
};

export default widget;
