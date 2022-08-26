export let activeEffect = undefined;
class ReactiveEffect {
  public active = true; // 控制effect的激活状态，默认是激活状态

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
      activeEffect = this; // 稍后调用fn，fn内部取值操作的时候，就可以获取到这个全局的activeEffect
      return this.fn();
    } finally {
      // 清除当前的effect
      activeEffect = undefined;
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
