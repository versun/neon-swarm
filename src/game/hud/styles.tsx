/**
 * 游戏 HUD 内联 keyframes（index.css 不可改，游戏页自包含动画定义）。
 * 所有动画遵循 design.md §9：短促 120–300ms 微交互 + 少量状态循环。
 */
export function HudStyles() {
  return (
    <style>{`
@keyframes ns-hp-flash{0%,100%{opacity:.25}50%{opacity:.75}}
@keyframes ns-ammo-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}
@keyframes ns-feed-in{from{transform:translateX(24px);opacity:0}to{transform:translateX(0);opacity:1}}
@keyframes ns-feed-out{to{opacity:0}}
@keyframes ns-kill-blink{0%,100%{opacity:1}25%,75%{opacity:.15}}
@keyframes ns-toast-in{from{transform:translateY(-12px);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes ns-toast-out{to{transform:translateY(-8px);opacity:0}}
@keyframes ns-panel-in{from{transform:translateY(24px);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes ns-deploy-in{from{transform:scale(.94);opacity:0}to{transform:scale(1);opacity:1}}
@keyframes ns-num-flip{from{transform:translateY(12px);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes ns-ring-shrink{from{stroke-dashoffset:0}to{stroke-dashoffset:var(--ns-ring-c)}}
@keyframes ns-target-down{0%{transform:scale(.9);opacity:0}30%{transform:scale(1.04);opacity:1}55%{transform:scale(1);opacity:1}100%{transform:scale(1);opacity:1}}
@keyframes ns-shield{0%{opacity:0}15%{opacity:1}80%{opacity:1}100%{opacity:0}}
@keyframes ns-vol-ring{from{transform:scale(.7);opacity:.8}to{transform:scale(1.2);opacity:0}}
@keyframes ns-recon-blink{0%,100%{opacity:1}50%{opacity:.25}}
@keyframes ns-menu-in{from{transform:scale(.95);opacity:0}to{transform:scale(1);opacity:1}}
@keyframes ns-score-in{from{transform:scale(.96);opacity:0}to{transform:scale(1);opacity:1}}
@keyframes ns-row-in{from{transform:translateY(8px);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes ns-err-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-2px)}75%{transform:translateX(2px)}}
@keyframes ns-energy-ring{from{transform:scale(.6);opacity:.8}to{transform:scale(1.2);opacity:0}}
@media (prefers-reduced-motion: reduce){
  .ns-anim, .ns-anim *{animation-duration:.01ms !important;animation-iteration-count:1 !important}
  .ns-anim-loop{animation:none !important}
}
`}</style>
  );
}
