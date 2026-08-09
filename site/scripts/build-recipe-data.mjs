// 从 CraftEngine 配置生成 wiki 使用的合成表数据。
// 配置源：ce配置/nong（本体）、蟹农和末地乐事/enders、蟹农和末地乐事/xienong、山茶花/camellia_ce_pack。
// 输入：configuration/recipes.yml（主工作台/熔炉配方）与少数设备配置中的 recipes 段、
//       configuration/langs/*.yml（中文名）、configuration/categories.yml（分类归属）
// 输出：src/data/recipes.json
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import {load} from 'js-yaml';
import {extractWorkstationRecipes} from './lib/workstation-recipes.mjs';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const siteDir = path.resolve(here, '..');
const repoDir = path.resolve(siteDir, '..');
const ceDir = path.resolve(siteDir, '..', 'ce配置', 'nong', 'configuration');
const endersDir = path.resolve(siteDir, '..', '蟹农和末地乐事', 'enders', 'configuration');
const xienongDir = path.resolve(siteDir, '..', '蟹农和末地乐事', 'xienong', 'configuration');
const camelliaDir = path.resolve(siteDir, '..', '山茶花', 'camellia_ce_pack', 'configuration');

/** 本体只有这些额外设备配方需要纳入 Wiki；其余方块配置配方是内部/装饰配方，保持原有统计口径。 */
const NONG_RECIPE_FILES = ['recipes.yml', path.join('blocks', 'salt_basin.yml')];

/** 蟹农的配方分散在多个文件里（末地乐事只有单个 recipes.yml）。 */
const XIENONG_RECIPE_FILES = ['seafood_recipes.yml', 'seafood_cooking.yml', 'barrels.yml', 'blocks.yml', 'coconut_tree.yml'];

function loadYaml(file) {
  return load(fs.readFileSync(file, 'utf8')) ?? {};
}

/** 收集所有 lang 文件里的 zh_cn / en_us 物品名，返回 {id: {zh, en}}。 */
function loadNames() {
  const names = {};
  // 农夫乐事本体 + 蟹农 / 末地乐事（工作站配方会引用 xienong: 与 endersdelight: 物品）。
  const extraRoot = path.resolve(siteDir, '..', '蟹农和末地乐事');
  const dirs = [path.join(ceDir, 'langs')];
  for (const pack of ['xienong', 'enders']) {
    const dir = path.join(extraRoot, pack, 'configuration', 'langs');
    if (fs.existsSync(dir)) dirs.push(dir);
  }
  const camelliaLangs = path.join(camelliaDir, 'langs');
  if (fs.existsSync(camelliaLangs)) dirs.push(camelliaLangs);
  for (const dir of dirs) loadNamesFromDir(dir, names);
  return names;
}

function loadNamesFromDir(dir, names) {
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.yml')) continue;
    const doc = loadYaml(path.join(dir, file));
    for (const section of Object.values(doc)) {
      if (!section || typeof section !== 'object') continue;
      for (const [locale, entries] of Object.entries(section)) {
        if (locale !== 'zh_cn' && locale !== 'en_us') continue;
        if (!entries || typeof entries !== 'object') continue;
        for (const [key, value] of Object.entries(entries)) {
          const id = translationKeyToId(key);
          if (!id) continue;
          names[id] ??= {};
          names[id][locale === 'zh_cn' ? 'zh' : 'en'] ??= String(value);
        }
      }
    }
  }
}

/** item.default.tomato / block.default.stove / block_name:default:stove -> default:tomato */
function translationKeyToId(key) {
  let m = /^(?:item|block)\.([a-z0-9_]+)\.([a-z0-9_./]+)$/.exec(key);
  if (m) return `${m[1]}:${m[2]}`;
  m = /^block_name:([a-z0-9_]+):([a-z0-9_./]+)$/.exec(key);
  if (m) return `${m[1]}:${m[2]}`;
  return null;
}

/** 从 categories.yml 建立 id -> 分类键 的反查表，并导出分类树。 */
function loadCategories() {
  const raw = {
    ...(loadYaml(path.join(ceDir, 'categories.yml')).categories ?? {}),
    ...(loadYaml(path.join(endersDir, 'categories.yml')).categories ?? {}),
    ...(loadYaml(path.join(xienongDir, 'categories.yml')).categories ?? {}),
    ...(loadYaml(path.join(camelliaDir, 'categories.yml')).categories ?? {}),
  };
  const categories = [];
  const itemCategory = {};
  for (const [key, value] of Object.entries(raw)) {
    const list = Array.isArray(value?.list) ? value.list : [];
    const children = list.filter((entry) => String(entry).startsWith('#'));
    const items = list.filter((entry) => !String(entry).startsWith('#')).map(String);
    categories.push({
      key,
      name: stripMiniMessage(value?.name) || key,
      icon: value?.icon ?? null,
      hidden: Boolean(value?.hidden),
      children: children.map((entry) => String(entry).slice(1)),
      items,
    });
    for (const item of items) itemCategory[item] ??= key;
  }
  return {categories, itemCategory};
}

/** 去掉 MiniMessage 标签，把 <l10n:category.nong.name> 之类留作 key 供人工替换。 */
function stripMiniMessage(value) {
  if (typeof value !== 'string') return '';
  const l10n = /<l10n:([^>]+)>/.exec(value);
  if (l10n) return `@${l10n[1]}`;
  return value.replace(/<[^>]*>/g, '').trim();
}

const CATEGORY_NAMES = {
  'category.nong.name': '农夫乐事',
  'category.nong.lore': '农夫乐事内容',
  'category.nong.workstations': '工作站',
  'category.nong.crops': '作物',
  'category.nong.silver_star_crops': '银星作物',
  'category.nong.ingredients': '食材',
  'category.nong.meals': '料理',
  'category.nong.feasts': '大餐',
  'category.nong.desserts': '甜点与饮品',
  'category.nong.blocks': '装饰方块',
  'category.nong.storage': '储物',
  'category.nong.feeds': '饲料',
  'category.nuanfeng.name': '暖风丰年',
  'category.nuanfeng.lore': '暖风丰年内容',
  'category.nuanfeng.farming': '农耕器械',
  'category.nuanfeng.workstations': '工作站',
  'category.nuanfeng.crops': '作物',
  'category.nuanfeng.ingredients': '食材',
  'category.nuanfeng.meals': '料理',
  'category.nuanfeng.desserts': '甜点与饮品',
  'category.nuanfeng.blocks': '装饰方块',
  'category.nuanfeng.storage': '储物',
};

/**
 * CraftEngine 允许把分类名的本地化内联在配置里（`translations#xxx: {zh_cn: {...}}`），
 * 蟹农就是这么写的。扫一遍三个包的配置收集这些翻译，优先于上面的手写表。
 */
function loadInlineTranslations() {
  const out = {};
  const visit = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(full);
        continue;
      }
      if (!entry.name.endsWith('.yml')) continue;
      let doc;
      try {
        doc = loadYaml(full);
      } catch {
        continue;
      }
      if (!doc || typeof doc !== 'object') continue;
      for (const [key, section] of Object.entries(doc)) {
        if (!key.startsWith('translations') || !section || typeof section !== 'object') continue;
        const zh = section.zh_cn;
        if (!zh || typeof zh !== 'object') continue;
        for (const [id, value] of Object.entries(zh)) out[id] ??= String(value);
      }
    }
  };
  for (const dir of [ceDir, endersDir, xienongDir, camelliaDir]) visit(dir);
  return out;
}

/** 递归列出目录下全部 .yml 文件的绝对路径。 */
function collectYamlFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectYamlFiles(full));
    else if (entry.name.endsWith('.yml')) out.push(full);
  }
  return out;
}

const INLINE_TRANSLATIONS = loadInlineTranslations();

function resolveCategoryName(name) {
  if (!name.startsWith('@')) return name;
  const key = name.slice(1);
  return INLINE_TRANSLATIONS[key] ?? CATEGORY_NAMES[key] ?? key;
}

/** 原版物品 id -> 中文名。只覆盖 recipes.yml 里实际用到的 minecraft:* 与标签。 */
const VANILLA_NAMES = {
  'minecraft:acacia_log': '金合欢原木',
  'minecraft:acacia_wood': '金合欢木',
  'minecraft:allium': '绒球葱',
  'minecraft:azure_bluet': '蓝花美耳草',
  'minecraft:bamboo_block': '竹块',
  'minecraft:birch_log': '白桦原木',
  'minecraft:birch_wood': '白桦木',
  'minecraft:blue_dye': '蓝色染料',
  'minecraft:blue_orchid': '兰花',
  'minecraft:cherry_log': '樱花原木',
  'minecraft:cherry_wood': '樱花木',
  'minecraft:chorus_flower': '紫颂花',
  'minecraft:chorus_fruit': '紫颂果',
  'minecraft:clay': '黏土',
  'minecraft:cornflower': '矢车菊',
  'minecraft:crimson_hyphae': '诡钉菌木',
  'minecraft:crimson_stem': '诡钉菌柄',
  'minecraft:dandelion': '蒲公英',
  'minecraft:dark_oak_log': '深色橡木原木',
  'minecraft:dark_oak_wood': '深色橡木',
  'minecraft:green_dye': '绿色染料',
  'minecraft:hanging_roots': '垂根',
  'minecraft:honey_block': '蜂蜜块',
  'minecraft:jungle_log': '丛林原木',
  'minecraft:jungle_wood': '丛林木',
  'minecraft:light_blue_dye': '淡蓝色染料',
  'minecraft:light_gray_dye': '淡灰色染料',
  'minecraft:lily_of_the_valley': '铃兰',
  'minecraft:lime_dye': '黄绿色染料',
  'minecraft:magenta_dye': '洋红色染料',
  'minecraft:mangrove_log': '红树原木',
  'minecraft:mangrove_wood': '红树木',
  'minecraft:melon': '西瓜',
  'minecraft:melon_seeds': '西瓜种子',
  'minecraft:oak_log': '橡木原木',
  'minecraft:oak_wood': '橡木',
  'minecraft:orange_tulip': '橙色郁金香',
  'minecraft:oxeye_daisy': '滨菊',
  'minecraft:pink_dye': '粉红色染料',
  'minecraft:pink_tulip': '粉红色郁金香',
  'minecraft:poppy': '虞美人',
  'minecraft:potion': '药水',
  'minecraft:pufferfish': '河豚',
  'minecraft:pumpkin_seeds': '南瓜种子',
  'minecraft:purple_dye': '紫色染料',
  'minecraft:red_dye': '红色染料',
  'minecraft:red_tulip': '红色郁金香',
  'minecraft:slime_block': '黏液块',
  'minecraft:spruce_log': '云杉原木',
  'minecraft:spruce_wood': '云杉木',
  'minecraft:torchflower': '火把花',
  'minecraft:torchflower_seeds': '火把花种子',
  'minecraft:terracotta': '陶瓦',
  'minecraft:tropical_fish': '热带鱼',
  'minecraft:warped_hyphae': '诡异菌木',
  'minecraft:warped_stem': '诡异菌柄',
  'minecraft:wet_sponge': '湿海绵',
  'minecraft:white_tulip': '白色郁金香',
  'minecraft:wither_rose': '凋灵玫瑰',
  'minecraft:stripped_acacia_log': '去皮金合欢原木',
  'minecraft:stripped_acacia_wood': '去皮金合欢木',
  'minecraft:stripped_bamboo_block': '去皮竹块',
  'minecraft:stripped_birch_log': '去皮白桦原木',
  'minecraft:stripped_birch_wood': '去皮白桦木',
  'minecraft:stripped_cherry_log': '去皮樱花原木',
  'minecraft:stripped_cherry_wood': '去皮樱花木',
  'minecraft:stripped_crimson_hyphae': '去皮诡钉菌木',
  'minecraft:stripped_crimson_stem': '去皮诡钉菌柄',
  'minecraft:stripped_dark_oak_log': '去皮深色橡木原木',
  'minecraft:stripped_dark_oak_wood': '去皮深色橡木',
  'minecraft:stripped_jungle_log': '去皮丛林原木',
  'minecraft:stripped_jungle_wood': '去皮丛林木',
  'minecraft:stripped_mangrove_log': '去皮红树原木',
  'minecraft:stripped_mangrove_wood': '去皮红树木',
  'minecraft:stripped_oak_log': '去皮橡木原木',
  'minecraft:stripped_oak_wood': '去皮橡木',
  'minecraft:stripped_spruce_log': '去皮云杉原木',
  'minecraft:stripped_spruce_wood': '去皮云杉木',
  'minecraft:stripped_warped_hyphae': '去皮诡异菌木',
  'minecraft:stripped_warped_stem': '去皮诡异菌柄',
  'minecraft:acacia_slab': '金合欢木台阶',
  'minecraft:acacia_trapdoor': '金合欢木活板门',
  'minecraft:apple': '苹果',
  'minecraft:baked_potato': '烤马铃薯',
  'minecraft:bamboo': '竹子',
  'minecraft:bamboo_slab': '竹台阶',
  'minecraft:bamboo_trapdoor': '竹活板门',
  'minecraft:barrel': '木桶',
  'minecraft:beef': '生牛肉',
  'minecraft:beetroot': '甜菜根',
  'minecraft:beetroot_seeds': '甜菜种子',
  'minecraft:birch_slab': '白桦木台阶',
  'minecraft:birch_trapdoor': '白桦木活板门',
  'minecraft:black_dye': '黑色染料',
  'minecraft:blaze_powder': '烈焰粉',
  'minecraft:bone': '骨头',
  'minecraft:bone_meal': '骨粉',
  'minecraft:book': '书',
  'minecraft:bowl': '碗',
  'minecraft:bread': '面包',
  'minecraft:brick': '红砖',
  'minecraft:bricks': '红砖块',
  'minecraft:brown_mushroom': '棕色蘑菇',
  'minecraft:bucket': '桶',
  'minecraft:cake': '蛋糕',
  'minecraft:campfire': '营火',
  'minecraft:carrot': '胡萝卜',
  'minecraft:cauldron': '炼药锅',
  'minecraft:chain': '锁链',
  'minecraft:cherry_slab': '樱花木台阶',
  'minecraft:cherry_trapdoor': '樱花木活板门',
  'minecraft:chest': '箱子',
  'minecraft:chicken': '生鸡肉',
  'minecraft:clay_ball': '黏土球',
  'minecraft:cocoa_beans': '可可豆',
  'minecraft:cod': '生鳕鱼',
  'minecraft:cooked_beef': '牛排',
  'minecraft:cooked_chicken': '熟鸡肉',
  'minecraft:cooked_cod': '熟鳕鱼',
  'minecraft:cooked_mutton': '熟羊肉',
  'minecraft:cooked_porkchop': '熟猪排',
  'minecraft:cooked_rabbit': '熟兔肉',
  'minecraft:cooked_salmon': '熟鲑鱼',
  'minecraft:cookie': '曲奇',
  'minecraft:copper_ingot': '铜锭',
  'minecraft:crimson_slab': '绯红木台阶',
  'minecraft:crimson_trapdoor': '绯红木活板门',
  'minecraft:crimson_fungus': '绯红菌',
  'minecraft:dark_oak_slab': '深色橡木台阶',
  'minecraft:dark_oak_trapdoor': '深色橡木活板门',
  'minecraft:coal': '煤炭',
  'minecraft:diamond': '钻石',
  'minecraft:emerald': '绿宝石',
  'minecraft:lapis_lazuli': '青金石',
  'minecraft:dried_kelp': '干海带',
  'minecraft:dirt': '泥土',
  'minecraft:egg': '鸡蛋',
  'minecraft:end_stone': '末地石',
  'minecraft:ender_pearl': '末影珍珠',
  'minecraft:ender_eye': '末影之眼',
  'minecraft:flint': '燧石',
  'minecraft:glass_bottle': '玻璃瓶',
  'minecraft:glow_berries': '发光浆果',
  'minecraft:gold_ingot': '金锭',
  'minecraft:golden_carrot': '金胡萝卜',
  'minecraft:gravel': '沙砾',
  'minecraft:hay_block': '干草捆',
  'minecraft:honey_bottle': '蜂蜜瓶',
  'minecraft:ice': '冰',
  'minecraft:ink_sac': '墨囊',
  'minecraft:iron_ingot': '铁锭',
  'minecraft:iron_nugget': '铁粒',
  'minecraft:jungle_slab': '丛林木台阶',
  'minecraft:jungle_trapdoor': '丛林木活板门',
  'minecraft:kelp': '海带',
  'minecraft:leather': '皮革',
  'minecraft:mangrove_slab': '红树木台阶',
  'minecraft:mangrove_trapdoor': '红树木活板门',
  'minecraft:melon_slice': '西瓜片',
  'minecraft:milk_bucket': '奶桶',
  'minecraft:mutton': '生羊肉',
  'minecraft:nautilus_shell': '鹦鹉螺壳',
  'minecraft:turtle_scute': '海龟鳞甲',
  'minecraft:netherite_ingot': '下界合金锭',
  'minecraft:oak_slab': '橡木台阶',
  'minecraft:oak_trapdoor': '橡木活板门',
  'minecraft:orange_dye': '橙色染料',
  'minecraft:paper': '纸',
  'minecraft:popped_chorus_fruit': '爆裂紫颂果',
  'minecraft:porkchop': '生猪排',
  'minecraft:potato': '马铃薯',
  'minecraft:pumpkin': '南瓜',
  'minecraft:pumpkin_pie': '南瓜派',
  'minecraft:rabbit': '生兔肉',
  'minecraft:red_mushroom': '红色蘑菇',
  'minecraft:rotten_flesh': '腐肉',
  'minecraft:salmon': '生鲑鱼',
  'minecraft:sea_pickle': '海泡菜',
  'minecraft:seagrass': '海草',
  'minecraft:shulker_shell': '潜影壳',
  'minecraft:slime_ball': '黏液球',
  'minecraft:spruce_slab': '云杉木台阶',
  'minecraft:spruce_trapdoor': '云杉木活板门',
  'minecraft:stick': '木棍',
  'minecraft:string': '线',
  'minecraft:sugar': '糖',
  'minecraft:sugar_cane': '甘蔗',
  'minecraft:sweet_berries': '甜浆果',
  'minecraft:warped_slab': '诡异木台阶',
  'minecraft:warped_trapdoor': '诡异木活板门',
  'minecraft:warped_fungus': '诡异菌',
  'minecraft:water_bucket': '水桶',
  'minecraft:wheat': '小麦',
  'minecraft:wheat_seeds': '小麦种子',
  'minecraft:white_dye': '白色染料',
  'minecraft:wind_charge': '风弹',
  'minecraft:wooden_shovel': '木铲',
  'minecraft:yellow_dye': '黄色染料',
  '#minecraft:planks': '任意木板',
  '#minecraft:logs': '任意原木',
  '#minecraft:wooden_slabs': '任意木台阶',
  '#minecraft:wool': '任意羊毛',
};

const TYPE_LABELS = {
  shaped: '有序合成',
  shapeless: '无序合成',
  smelting: '熔炉熔炼',
  smoking: '烟熏炉',
  campfire_cooking: '营火烹饪',
  blasting: '高炉',
  stonecutting: '切石机',
  smithing_transform: '锻造台',
  cask: '小木桶发酵',
  cooking_pot: '烹饪锅',
  cutting_board: '砧板切割',
  skillet: '煎锅',
  stomping_basin: '木盆踩踏',
  crab_trap: '捕蟹笼',
};

/** 工作站配方 -> 与原版配方同构的结构，便于前端共用一套渲染。 */
function buildWorkstationRecipes(displayName) {
  const raw = extractWorkstationRecipes({
    pluginRoot: path.join(repoDir, '插件'),
    crabRoot: path.join(repoDir, '蟹农和末地乐事'),
  });
  const withNames = (entries) => entries.map((entry) => ({...entry, name: displayName(entry.id)}));
  return raw.map((entry) => {
    const recipe = {
      id: entry.id,
      type: entry.station,
      typeLabel: TYPE_LABELS[entry.station] ?? entry.station,
      station: entry.station,
      category: null,
      // 捕蟹笼是加权产出池，没有确定产物，不能伪装成固定 result。
      result:
        entry.station === 'crab_trap' || !entry.result
          ? null
          : {id: entry.result.id, count: entry.result.count ?? 1},
      resultName: entry.station === 'crab_trap' ? null : displayName(entry.result?.id),
      ingredients: (entry.inputs ?? []).map((slot) => withNames(slot)),
      outputs: withNames(entry.outputs ?? []),
    };
    if (entry.container) recipe.container = {...entry.container, name: displayName(entry.container.id)};
    if (entry.tool) recipe.tool = entry.tool;
    if (entry.bait) recipe.bait = {...entry.bait, name: displayName(entry.bait.id)};
    if (entry.biomes) recipe.biomes = entry.biomes;
    if (entry.seconds != null) recipe.seconds = entry.seconds;
    if (entry.experience != null) recipe.experience = entry.experience;
    if (entry.displayName) recipe.recipeName = entry.displayName;
    // 捕蟹笼池名带中文群系与饵料名，方便直接作为卡片标题。
    if (entry.biomeLabel) {
      recipe.recipeName = `${entry.biomeLabel}产出池（${
        entry.bait ? `饵料：${displayName(entry.bait.id)}` : '无饵料'
      }）`;
    }
    if (entry.liquidName) recipe.liquidName = entry.liquidName;
    if (entry.stompsPerItem != null) recipe.stompsPerItem = entry.stompsPerItem;
    if (entry.mbPerItem != null) recipe.mbPerItem = entry.mbPerItem;
    if (entry.direct) recipe.direct = {...entry.direct, name: displayName(entry.direct.id)};
    if (entry.gold != null) recipe.gold = entry.gold;

    return recipe;
  });
}

function main() {
  const names = loadNames();
  const {categories, itemCategory} = loadCategories();
  const displayName = (id) => {
    if (!id) return null;
    if (names[id]?.zh) return names[id].zh;
    if (VANILLA_NAMES[id]) return VANILLA_NAMES[id];
    if (names[id]?.en) return names[id].en;
    return id;
  };

  const recipes = [];
  // 本体主配方 + 晒盐池自身配置里的 1 条工作台配方。
  const nongRaw = {};
  for (const relative of NONG_RECIPE_FILES) {
    const full = path.join(ceDir, relative);
    if (!fs.existsSync(full)) continue;
    Object.assign(nongRaw, loadYaml(full).recipes ?? {});
  }

  // 蟹农把配方散在多个业务文件里，逐个合并。
  const xienongRaw = {};
  for (const file of XIENONG_RECIPE_FILES) {
    const full = path.join(xienongDir, file);
    if (!fs.existsSync(full)) continue;
    Object.assign(xienongRaw, loadYaml(full).recipes ?? {});
  }
  // 末地乐事除 recipes.yml 外，还把方块自身的合成写在 blocks/*.yml（如末地石炉灶），
  // 所以递归扫描整个目录收集 recipes 段，避免遗漏。
  const endersRaw = {};
  for (const full of collectYamlFiles(endersDir)) {
    Object.assign(endersRaw, loadYaml(full).recipes ?? {});
  }
  // 山茶花把茶壶配方写在 blocks/tea.yml，同样递归扫描目录。
  const camelliaRaw = {};
  for (const full of collectYamlFiles(camelliaDir)) {
    Object.assign(camelliaRaw, loadYaml(full).recipes ?? {});
  }
  const sources = [
    {source: null, raw: nongRaw},
    {source: 'endersdelight', raw: endersRaw},
    {source: 'xienong', raw: xienongRaw},
    {source: 'camellia', raw: camelliaRaw},
  ];
  for (const {source, raw} of sources)
  for (const [id, value] of Object.entries(raw)) {
    if (!value || typeof value !== 'object') continue;
    const type = String(value.type ?? '');
    const result = normalizeResult(value.result);
    const recipe = {
      id,
      type,
      ...(source ? {source} : null),
      typeLabel: TYPE_LABELS[type] ?? type,
      category: value.category ?? null,
      result,
      resultName: displayName(result?.id),
    };
    if (type === 'shaped') {
      const pattern = (value.pattern ?? []).map(String);
      const ingredients = value.ingredients ?? {};
      recipe.pattern = pattern;
      recipe.key = Object.fromEntries(
        Object.entries(ingredients).map(([symbol, ing]) => {
          const list = normalizeIngredient(ing);
          return [symbol, list.map((entry) => ({id: entry, name: displayName(entry)}))];
        }),
      );
    } else if (type === 'shapeless') {
      recipe.ingredients = (value.ingredients ?? []).map((ing) => {
        const list = normalizeIngredient(ing);
        return list.map((entry) => ({id: entry, name: displayName(entry)}));
      });
    } else {
      const list = normalizeIngredient(value.ingredient);
      recipe.ingredients = [list.map((entry) => ({id: entry, name: displayName(entry)}))];
      if (value.experience != null) recipe.experience = Number(value.experience);
      if (value.cookingtime != null) recipe.cookingTime = Number(value.cookingtime);
    }
    recipe.resultCategory = result?.id ? (itemCategory[result.id] ?? null) : null;
    recipes.push(recipe);
  }

  const workstationRecipes = buildWorkstationRecipes(displayName);
  for (const recipe of workstationRecipes) {
    recipe.resultCategory = recipe.result?.id ? (itemCategory[recipe.result.id] ?? null) : null;
    recipes.push(recipe);
  }

  const resolvedCategories = categories.map((category) => ({
    ...category,
    name: resolveCategoryName(category.name),
  }));

  // 图鉴里有大量物品不参与任何配方（如种子、野生作物、银星作物），
  // 它们的中文名只能从语言文件取，所以单独导出一份 id -> 名称表。
  const itemNames = {};
  for (const category of categories) {
    for (const id of category.items) itemNames[id] = displayName(id);
  }
  for (const id of Object.keys(names)) itemNames[id] ??= displayName(id);

  const outDir = path.join(siteDir, 'src', 'data');
  fs.mkdirSync(outDir, {recursive: true});
  const payload = {
    generatedFrom: 'ce配置/nong/configuration',
    counts: countByType(recipes),
    categories: resolvedCategories,
    itemNames,
    recipes,
  };
  fs.writeFileSync(path.join(outDir, 'recipes.json'), JSON.stringify(payload, null, 2) + '\n', 'utf8');

  const missing = recipes
    .flatMap((recipe) => collectIds(recipe))
    .filter((id) => !names[id]?.zh && !VANILLA_NAMES[id]);
  const uniqueMissing = [...new Set(missing)].sort();
  console.log(`已生成 ${recipes.length} 条配方 -> src/data/recipes.json`);
  console.log('分类数:', resolvedCategories.length);
  if (uniqueMissing.length) {
    console.log(`缺少中文名的 id（${uniqueMissing.length}）:`, uniqueMissing.join(', '));
  }
}

function countByType(recipes) {
  const counts = {};
  for (const recipe of recipes) counts[recipe.type] = (counts[recipe.type] ?? 0) + 1;
  return counts;
}

function collectIds(recipe) {
  const ids = [];
  if (recipe.result?.id) ids.push(recipe.result.id);
  for (const list of Object.values(recipe.key ?? {})) {
    for (const entry of list) ids.push(entry.id);
  }
  for (const list of recipe.ingredients ?? []) {
    for (const entry of list) ids.push(entry.id);
  }
  for (const entry of recipe.outputs ?? []) ids.push(entry.id);
  if (recipe.container?.id) ids.push(recipe.container.id);
  if (recipe.bait?.id) ids.push(recipe.bait.id);
  return ids;
}

function normalizeResult(result) {
  if (!result) return null;
  if (typeof result === 'string') return {id: result, count: 1};
  return {id: String(result.id ?? ''), count: Number(result.count ?? 1)};
}

/** 材料可能是字符串、字符串数组，或 {id: ...}。统一成 id 字符串数组。 */
function normalizeIngredient(ingredient) {
  if (ingredient == null) return [];
  if (typeof ingredient === 'string') return [ingredient];
  if (Array.isArray(ingredient)) return ingredient.flatMap((entry) => normalizeIngredient(entry));
  if (typeof ingredient === 'object') {
    if (ingredient.id != null) return [String(ingredient.id)];
    if (ingredient.item != null) return [String(ingredient.item)];
  }
  return [];
}

main();
