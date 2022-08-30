export let activeEffect = undefined;
class ReactiveEffect {
  public parent = null; // 标记当前effect的父级effect，当出现嵌套的effect的时候有用
  public active = true; // 控制effect的激活状态，默认是激活状态
  public deps = []; // 收集依赖了哪些属性

  constructor(public fn, public scheduler) {}

  // run就是执行effect
  run() {
    // 如果是非激活状态，只需要执行函数，不需要进行依赖收集
    if (!this.active) {
      return this.fn();
    }

    // 下面进行依赖收集
    // 核心是：将当前的 effect 和 稍后渲染的属性 关联在一起
    try {
      this.parent = activeEffect; // 记录上一级的effect
      activeEffect = this; // 稍后调用fn，fn内部取值操作的时候，就可以获取到这个全局的activeEffect

      // 这里需要在用户函数执行之前将收集的内容全部清空(收集的依赖可能会改变)
      // 案例参见branch_effect.html
      cleanupEffect(this);

      return this.fn();
    } finally {
      // 还原成之前的effect
      activeEffect = this.parent;
    }
  }

  stop() {
    if (this.active) {
      // 不进行依赖收集了
      this.active = false;
      // 清空收集的依赖，防止属性变化了依旧调用run方法
      cleanupEffect(this);
    }
  }
}

// effect可以嵌套着写： effect(() => { state.name; effect(() => {state.age})})
export function effect(fn, options: any = {}) {
  // fn可以根据状态变化重新执行

  const _effect = new ReactiveEffect(fn, options.scheduler); // 创建响应式的effect
  // 默认先执行一次
  _effect.run();

  const runner = _effect.run.bind(_effect); // 绑定this
  // 将对应的effect挂载到runner上
  runner.effect = _effect;

  return runner;
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
  let effects = depsMap.get(key);

  // 在执行前，先拷贝一份来执行，不要关联引用（详情见注意事项3）
  if (effects) {
    effects = new Set(effects);
    // 这样去循环的时候是去循环新的effects，即使老的effects有变化也不会影响到新的effects
    effects.forEach((effect) => {
      // 如果在执行effect的时候，又要执行自己
      // 那么需要屏蔽掉防止循环递归，最终爆栈
      // 比如：effect(()=> { state.name++ })
      // 触发了effect.run()之后又改了值，又会触发更新，从而死循环
      // 如果当前调用run的effect没有重复
      if (effect !== activeEffect) {
        if (effect.scheduler) {
          // 如果用户传入了调度函数，则用用户的
          effect.scheduler();
        } else {
          // 否则默认刷新视图
          effect.run();
        }
      }
    });
  }
}

function cleanupEffect(effect) {
  const { deps } = effect;
  // 解除effect和属性的关联，重新收集依赖
  for (let i = 0; i < deps.length; i++) {
    deps[i].delete(effect);
  }
  effect.deps.length = 0;
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

// 3. 为什么要拷贝一份effect来执行呢？
// 因为上面在执行run方法的时候：
// cleanupEffect(this); -》 解除effects和属性的关联
// return this.fn(); -》 这里又会重新收集
// 如果使用的是同一个effects那么就是删了依赖又收集依赖从而死循环
// 就如：let s = new set([1])
// s.forEach(item => {s.delete(1);s.add(1)});
// 这就是一个关联引用，会造成死循环

// 4. 响应式原理总结
// (1). new Proxy 代理对象属性的set和get
// (2). effect: 默认数据变化了要更新
// (3). 先将正在执行的effect作为全局变量，作为属性和effect沟通的一个桥梁
// (4). 之后渲染取值的时候，在proxy的get方法中进行依赖收集
// (5). WeakMap(对象: Map(属性: Set(effect)))
// (6). 稍后用户改变对象属性的时候，会通过属性来查找对应的effect集合，找到effect全部执行
