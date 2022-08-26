export let activeEffect = undefined;
class ReactiveEffect {
  public parent = null; // 标记当前effect的父级effect，当出现嵌套的effect的时候有用
  public active = true; // 控制effect的激活状态，默认是激活状态
  public deps = []; // 收集依赖了哪些属性

  constructor(public fn) {}

  // run就是执行effect
  run() {
    // 如果是非激活状态，只需要执行函数，不需要进行依赖收集
    if (!this.active) {
      this.fn();
    }

    // 下面进行依赖收集
    // 核心是：将当前的 effect 和 稍后渲染的属性 关联在一起
    try {
      this.parent = activeEffect; // 记录上一级的effect
      activeEffect = this; // 稍后调用fn，fn内部取值操作的时候，就可以获取到这个全局的activeEffect
      return this.fn();
    } finally {
      // 还原成之前的effect
      activeEffect = this.parent;
    }
  }
}

// effect可以嵌套着写： effect(() => { state.name; effect(() => {state.age})})
export function effect(fn) {
  // fn可以根据状态变化重新执行

  const _effect = new ReactiveEffect(fn); // 创建响应式的effect
  // 默认先执行一次
  _effect.run();
}

// 依赖收集函数： 对象上的某个属性 =》多个effect
// 数据结构：WeakMap -》 Map -》 Set
// WeakMap可以使用对象作为key，所以一开始使用WeakMap
// 接下来属性和Set对应的时候，属性是字符串，所以只能使用Map
// 即：WeakMap{obj对象, Map{属性, Set(effect)}}
// 同时一个effect =》 多个属性
// 结论：effect和属性是多对多关系
const targetMap = new WeakMap();
export function track(target, type, key) {
  // 如果当前不需要收集effect，则直接退出
  // 比如用户直接使用state.name而不是通过effect(() => state.name)
  if (!activeEffect) return;

  let depsMap = targetMap.get(target);
  if (!depsMap) {
    // 第一次进行获取的时候，进行初始化
    targetMap.set(target, (depsMap = new Map()));
  }

  let dep = depsMap.get(key);
  if (!dep) {
    // 第一次进行获取的时候，进行初始化
    depsMap.set(key, (dep = new Set()));
  }

  let shouldTrack = !dep.has(activeEffect);
  if (shouldTrack) {
    // 之前没有相同的effect,所以进行收集
    dep.add(activeEffect);

    // 让effect记录住对应的dep
    // 之后清理的时候会用到
    activeEffect.deps.push(dep);
  }

  // 属性记录了effect，是单向记录
  // 但是最终要双向记录，应该让effect也记录他被哪些属性收集过
  // 这样是为了可以清理，详情见注意事项
}

export function trigger(target, type, key, newValue, oldValue) {
  // 找target对应的属性Map
  const depsMap = targetMap.get(target);
  // 触发的值不在模板中使用
  if (!depsMap) return;

  // 找属性对应的effect Set
  const effects = depsMap.get(key);
  effects &&
    effects.forEach((effect) => {
      // 如果在执行effect的时候，又要执行自己
      // 那么需要屏蔽掉防止循环递归，最终爆栈
      // 比如：effect(()=> { state.name++ })
      // 触发了effect.run()之后又改了值，又会触发更新，从而死循环
      // 如果当前调用run的effect没有重复
      if (effect !== activeEffect) effect.run();
    });
}

// -------------------------注意事项--------------------
// 1. 关于parent属性的用处：
// 当出现如下代码时：
// effect(() => {
//   state.name; // 当前的parent：null，effect是e1
//   effect(() => { // 当前的parent：null，effect是e2
//     state.age;
//   })
//   effect(() => { // 当前的parent：null，effect是e3
//     state.key
//   })
//   state.address // 当前的parent：null，effect是e1
// })
// 从而可以保证每次在进行依赖收集的时候effect可以被正确的找到

// 2. 为什么effect要反向收集它被哪些属性记录过？
// 比如如下代码：
// effect(() => {
//   flag ? state.name : state.age
// })
// 这种分支控制的时候，比如走age这个分支，那么就需要把name上面的effect删除
