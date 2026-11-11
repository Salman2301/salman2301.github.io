import type { WidgetDef } from '../../core/types';
import Radio from './Radio.svelte';

const widget: WidgetDef = {
  id: 'radio',
  title: 'Radio',
  description: 'Free live radio stations (FIP, Radio Paradise, NTS, WFMU and more) with favourites, drawn in your theme. Also in the status bar.',
  icon: '♪',
  component: Radio,
  keywords: ['music', 'radio', 'stream', 'live', 'fip', 'nts', 'paradise', 'jazz', 'classical', 'lofi', 'news', 'favourites', 'player'],
};

export default widget;
