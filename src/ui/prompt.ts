export const PROJECT_PROMPT = `开发一个交互式 Type A₂ affine alcove walk 网站。
数学坐标取 x=<alpha_1,v>, y=<alpha_2,v>；反射墙为 x=n, y=n, x+y=n。Fundamental alcove A₀ 满足 x>0,y>0,x+y<1。将每个 alcove 的三条墙一致地标为 s₀,s₁,s₂，分别用绿、红、蓝区分。注意：颜色不是按平行线方向统一着色，而是 affine Coxeter complex 的墙类型（A₀ 的 x+y=1,x=0,y=0 分别为 s₀,s₁,s₂）。
用户从黄色高亮的 A₀ 出发，点击邻接三角形添加路径节点，并自动连线、标方向箭头和编号。只能跨越共边邻居；回走允许并记录为新的一步。采用右乘 w->ws_i 的反射字次序。加入手动输入反射字、逐步记录、Coxeter length 与 reduced 判断、撤销/重做、清空、平移缩放、居中/适合路径、可选吸附中心、刷新后恢复以及 SVG 导出（包含完整路线）。
样式参考 https://cubicbear.github.io/doc/affineNotes.pdf#page=75 ，路径示例参考 Example 2.19（第19页）；明确区分已核对的示例与演示路线。数学逻辑和绘图组件分离，并给出单元测试（墙类型一致性、相邻反射 involution、A₂ braid、Coxeter length、撤销/回退）。
技术目标：TypeScript + SVG，尽量零运行时依赖，提供可本地运行的源码、README 和测试。`;
