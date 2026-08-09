import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  wikiSidebar: [
    'intro',
    'updates',
    {
      type: 'category',
      label: '合成表',
      collapsed: false,
      items: ['recipes/crafting', 'recipes/cooking', 'recipes/browser'],
    },
    {
      type: 'category',
      label: '设备使用方式',
      collapsed: false,
      items: [
        'stations/overview',
        'stations/stove',
        'stations/cooking-pot',
        'stations/skillet',
        'stations/cutting-board',
        'stations/cask',
        'stations/stomping-basin',
      ],
    },
    {
      type: 'category',
      label: '农耕与其他玩法',
      items: ['farming/crops', 'farming/tools', 'farming/crabbing', 'farming/tea'],
    },
    {
      type: 'category',
      label: '参考资料',
      items: ['items/catalog', 'advancements'],
    },
    {
      type: 'category',
      label: '管理员',
      items: ['admin/commands', 'admin/config', 'admin/recipes-yml'],
    },
  ],
};

export default sidebars;
