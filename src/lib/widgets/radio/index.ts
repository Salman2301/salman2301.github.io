import type { WidgetDef } from '../../core/types';
import Radio from './Radio.svelte';

const widget: WidgetDef = {
  id: 'radio',
  title: 'Radio',
  description: 'Free, ad-free ambient and lounge radio (SomaFM), drawn in your theme. Also in the status bar.',
  icon: '♪',
  component: Radio,
  keywords: ['music', 'radio', 'stream', 'ambient', 'lounge', 'focus', 'somafm', 'player'],
};

export default widget;
