// 3D 图标烘焙的自动断言。失败时退出码非 0。
//
// 检查三件事：
//   1. 每张烘焙图非透明像素占比在合理区间（排除全空 / 铺满整幅画布）
//   2. 烘焙图与「该模型单面贴图直接放大」的结果不同（证明走了几何渲染而非退化成贴图）
//   3. 带 rotation 的模型，关掉 rotation 后结果必须不同（证明 rotation 生效）
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import {PNG} from 'pngjs';
import {renderModel, loadTexture, opaqueRatio, resolveModel} from './lib/model-render.mjs';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const siteDir = path.resolve(here, '..');
const rootDir = path.resolve(siteDir, '..');
const packAssets = path.join(rootDir, 'ce配置', 'nong', 'resourcepack', 'assets');
const vanillaAssets = path.join(rootDir, 'assets', 'minecraft');
const imgDir = path.join(siteDir, 'static', 'img', 'items');

function splitRef(ref) {
  const text = String(ref);
  const i = text.indexOf(':');
  return i === -1 ? ['minecraft', text] : [text.slice(0, i), text.slice(i + 1)];
}
function findFile(ref, kind, ext) {
  const [ns, rest] = splitRef(ref);
  const a = path.join(packAssets, ns, kind, `${rest}.${ext}`);
  if (fs.existsSync(a)) return a;
  if (ns === 'minecraft') {
    const b = path.join(vanillaAssets, kind, `${rest}.${ext}`);
    if (fs.existsSync(b)) return b;
  }
  return null;
}
const findModelFile = (ref) => findFile(ref, 'models', 'json');
const resolveTexture = (ref) => {
  const file = findFile(ref, 'textures', 'png');
  return file ? loadTexture(file) : null;
};

const failures = [];
function check(ok, message) {
  if (!ok) failures.push(message);
}

// ---- 1. 所有烘焙产物的像素占比 ----
const files = fs.readdirSync(imgDir).filter((name) => name.startsWith('model__'));
// 88 个自定义模型：农夫乐事 81 个资源包模型 + stove（模型由 CE 配置的 generation 段
// 运行时生成，无模型文件），末地乐事 6 个（末地石炉、金煎锅 4 态、金烹饪锅）。
// 另有 87 个原版方块按自带 models/block 烘焙：64 个满方块/柱体/台阶等 + 11 个活板门
// （取 _bottom 关闭态）+ 6 个木板（#minecraft:planks）+ 6 个木台阶（#minecraft:wooden_slabs）。
// 蟹农 20 个：捕蟹笼、椰子树等直接模型，以及 15 个 template 展开的桶装海鲜/珍珠块/板条箱。
// 原版方块从 87 增到 88：末地石炉灶配方引入了 minecraft:end_stone。
// 山茶花 2 个：茶壶家具模型，以及茶壶配方引入的原版 minecraft:terracotta。
// 晒盐池新增 1 个本体模型图标。
check(files.length === 199, `烘焙图数量应为 199，实际 ${files.length}`);

for (const name of files) {
  const png = PNG.sync.read(fs.readFileSync(path.join(imgDir, name)));
  check(png.width === 64 && png.height === 64, `${name} 尺寸应为 64x64，实际 ${png.width}x${png.height}`);
  const ratio = opaqueRatio(png.data);
  check(ratio >= 0.05, `${name} 非透明像素过少：${(ratio * 100).toFixed(1)}%`);
  check(ratio <= 0.9, `${name} 非透明像素过多（可能未正确投影）：${(ratio * 100).toFixed(1)}%`);
}
console.log(`✓ ${files.length} 张烘焙图尺寸与像素占比合规`);

// ---- 2. 与平面贴图放大结果不同 ----
// 取砧板：它是一块薄板，等轴测下应是斜的平行四边形，绝不可能等于贴图铺满正方形。
const board = renderModel('minecraft:block/custom/cutting_board', {
  findModelFile,
  resolveTexture,
  size: 64,
});
check(Boolean(board), '砧板渲染失败');
if (board) {
  const ratio = opaqueRatio(board.pixels);
  // 平面贴图放大后会铺满整幅画布（占比接近 1），几何渲染必然远小于此
  check(ratio < 0.6, `砧板占比 ${(ratio * 100).toFixed(1)}%，接近铺满，疑似退化成平面贴图`);
  // 四角必须透明：等轴测的斜置薄板不会覆盖画布角落
  const corners = [0, 63, 64 * 63, 64 * 64 - 1].map((i) => board.pixels[i * 4 + 3]);
  check(corners.every((alpha) => alpha === 0), `砧板四角应透明，实际 alpha=${corners.join(',')}`);
  console.log(`✓ 砧板为几何渲染（占比 ${(ratio * 100).toFixed(1)}%，四角透明）`);
}

// ---- 3. rotation 生效 ----
// 注意别拿煎锅当样本：它的 rotation 全是 angle:0，开关无差异属正常。
// jar_1 有 ±45° 的元素旋转，关掉后像素必须变化。
const ROT_SAMPLE = 'minecraft:block/custom/jar_1';
const rotated = renderModel(ROT_SAMPLE, {findModelFile, resolveTexture, size: 64, applyRotation: true});
const flat = renderModel(ROT_SAMPLE, {findModelFile, resolveTexture, size: 64, applyRotation: false});
check(Boolean(rotated && flat), `${ROT_SAMPLE} 渲染失败`);
if (rotated && flat) {
  let diff = 0;
  for (let i = 0; i < rotated.pixels.length; i += 1) {
    if (rotated.pixels[i] !== flat.pixels[i]) diff += 1;
  }
  check(diff > 100, `${ROT_SAMPLE} 开关 rotation 差异仅 ${diff} 字节，元素 rotation 疑似未生效`);
  console.log(`✓ 元素 rotation 生效（jar_1 开关 rotation 有 ${diff} 个字节差异）`);
}

// ---- 4. 继承原版立方体的模型确实拿到了几何 ----
for (const ref of ['minecraft:block/custom/tatami', 'minecraft:block/custom/carrot_crate']) {
  const model = resolveModel(ref, findModelFile);
  if (!model) continue; // 该模型不存在则跳过，由数量断言兜底
  check(Boolean(model.elements?.length), `${ref} 未从父链解析到 elements`);
}
console.log('✓ 继承原版立方体的模型能从父链取到 elements');

// ---- 5. 用户点名的方块必须全部走 3D，不能回落成平面贴图 ----
const icons = JSON.parse(fs.readFileSync(path.join(siteDir, 'src', 'data', 'items.json'), 'utf8')).icons;
const MUST_BE_3D = [
  'stove', 'skillet', 'cask', 'stomping_basin', 'cutting_board', 'tatami',
  'half_tatami_mat', 'canvas_rug', 'rope_fence_gate', 'wooden_basket',
  'bamboo_basket', 'tree_tapper', 'basin',
];
for (const name of MUST_BE_3D) {
  const id = `default:${name}`;
  const layer = icons[id]?.[0];
  check(
    typeof layer === 'string' && layer.includes('model__'),
    `${id} 应使用 3D 烘焙图标，实际为 ${layer ?? '缺失'}`,
  );
}
console.log(`✓ ${MUST_BE_3D.length} 个点名方块均使用 3D 图标`);

// ---- 6. 原版方块走 3D，原版平面物品必须保持贴图 ----
const is3d = (id) => {
  const layers = icons[id];
  if (!layers) return false;
  return layers.some((l) => (typeof l === 'string' ? l : l.url).includes('model__'));
};
const VANILLA_BLOCKS = [
  'minecraft:bricks', 'minecraft:oak_log', 'minecraft:oak_wood', 'minecraft:oak_slab',
  'minecraft:stripped_oak_log', 'minecraft:hay_block', 'minecraft:pumpkin', 'minecraft:melon',
  'minecraft:clay', 'minecraft:gravel', 'minecraft:ice', 'minecraft:honey_block',
  'minecraft:slime_block', 'minecraft:wet_sponge', 'minecraft:oak_trapdoor',
];
for (const id of VANILLA_BLOCKS) {
  check(is3d(id), `${id} 是方块，应使用 3D 烘焙图标`);
}
console.log(`✓ ${VANILLA_BLOCKS.length} 个原版方块均使用 3D 图标`);

// 平面物品（继承 item/generated 或 handheld）不能被误判成方块
const VANILLA_FLAT = [
  'minecraft:carrot', 'minecraft:wheat', 'minecraft:stick', 'minecraft:sugar',
  'minecraft:paper', 'minecraft:bread', 'minecraft:apple', 'minecraft:egg',
  'minecraft:bowl', 'minecraft:bucket',
];
for (const id of VANILLA_FLAT) {
  check(!is3d(id), `${id} 是平面物品，不应被当作方块烘焙`);
}
console.log(`✓ ${VANILLA_FLAT.length} 个原版平面物品保持贴图`);

// ---- 7. 蟹农 template 物品必须展开成功并走 3D ----
// 这些物品在 YAML 里只有 template + arguments，模型路径写成 ${id}，
// 不展开占位符就完全取不到贴图，会静默变成缺失图标。
const XIENONG_TEMPLATE_BLOCKS = [
  'xienong:clam_barrel', 'xienong:crab_barrel', 'xienong:frog_leg_barrel',
  'xienong:pearl_block', 'xienong:scute_block',
  'xienong:coconut_crate', 'xienong:sea_pickle_crate',
];
for (const id of XIENONG_TEMPLATE_BLOCKS) {
  check(is3d(id), `${id} 是模板方块，应展开 \${} 占位符并 3D 烘焙，实际为 ${icons[id]?.[0] ?? '缺失'}`);
}
console.log(`✓ ${XIENONG_TEMPLATE_BLOCKS.length} 个蟹农模板方块展开并使用 3D 图标`);

// 蟹农成就的 12 个触发物品都必须有图标，否则成就页会出现空图
const XIENONG_ADVANCEMENT_ITEMS = [
  'xienong:crab_trap', 'xienong:pearl', 'xienong:shrimp_fried_rice', 'xienong:crab_claw',
  'xienong:raw_squid_tentacles', 'xienong:raw_glow_squid_tentacles', 'xienong:raw_frog_leg',
  'xienong:clawster', 'xienong:crab', 'xienong:cooked_crab', 'xienong:cooked_shrimp',
  'xienong:cooked_clawster',
];
for (const id of XIENONG_ADVANCEMENT_ITEMS) {
  check(Boolean(icons[id]?.length), `${id} 是蟹农成就触发物，必须有图标`);
}
console.log(`✓ ${XIENONG_ADVANCEMENT_ITEMS.length} 个蟹农成就触发物均有图标`);

// ---- 8. 配方数据与设备合成配方回归 ----
// 463 = 139 农夫乐事工作台/熔炉类 + 1 晒盐池 + 230 工作站 + 22 末地乐事 + 70 蟹农 + 1 山茶花（茶壶）。
const recipes = JSON.parse(fs.readFileSync(path.join(siteDir, 'src', 'data', 'recipes.json'), 'utf8')).recipes;
check(recipes.length === 463, `配方总数应为 463，实际 ${recipes.length}`);

// 这些设备的合成配方分散在业务 YAML 中，各页面都直接引用它们。
const STATION_RECIPES = [
  'default:salt_basin',
  'xienong:crab_trap',
  'endersdelight:endstone_stove',
  'endersdelight:cooking_pot_gold',
  'endersdelight:skillet_gold',
];
for (const id of STATION_RECIPES) {
  const hit = recipes.filter((r) => r.result?.id === id && r.type === 'shaped');
  check(hit.length === 1, `${id} 应有 1 条 shaped 合成配方，实际 ${hit.length}`);
}
console.log(`✓ ${STATION_RECIPES.length} 台设备的合成配方存在`);

// 仅金烹饪锅可做的料理（CookingPotRecipeService.addGoldRecipe）必须带 gold 标记，
// 且要有独立的金色 GUI 布局与贴图，否则配方浏览器会错误显示成普通锅。
const goldRecipes = recipes.filter((r) => r.gold === true);
check(goldRecipes.length === 11, `仅金锅配方应为 11 条，实际 ${goldRecipes.length}`);
check(
  goldRecipes.every((r) => r.type === 'cooking_pot'),
  '仅金锅配方的 type 必须都是 cooking_pot',
);
const layouts = JSON.parse(fs.readFileSync(path.join(siteDir, 'src', 'data', 'gui-layouts.json'), 'utf8'));
const goldLayout = layouts.cooking_pot_gold;
check(Boolean(goldLayout), 'gui-layouts.json 缺少 cooking_pot_gold 布局');
if (goldLayout) {
  check(
    goldLayout.image === '/img/gui/cooking_pot_gold.png',
    `cooking_pot_gold 应指向金锅贴图，实际 ${goldLayout.image}`,
  );
  // 金锅与普通锅同版式：槽位坐标必须逐一相同，只有贴图不同。
  const plain = layouts.cooking_pot;
  check(
    JSON.stringify({...goldLayout, image: null, slotSource: null}) ===
      JSON.stringify({...plain, image: null, slotSource: null}),
    'cooking_pot_gold 槽位布局应与 cooking_pot 完全一致',
  );
}
const goldGui = path.join(siteDir, 'static', 'img', 'gui', 'cooking_pot_gold.png');
check(fs.existsSync(goldGui), '缺少 static/img/gui/cooking_pot_gold.png');
console.log(`✓ ${goldRecipes.length} 条仅金锅配方与金色 GUI 布局就位`);

if (failures.length) {
  console.error(`\n✗ ${failures.length} 项断言失败：`);
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}
console.log('\n全部断言通过');
