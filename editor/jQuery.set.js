function setProp(input, prop, info) {
  const tokens = prop.split(".");
  let current = info;
  let i = 0;
  while (current != null && i < tokens.length) {
    current = current[tokens[i]];
    i++;
  }
  if (current != undefined) {
    if ($(input).hasClass("g-button")) {
      $(input).toggleClass("g-active", current === true);
    } else {
      $(input).val(current);
    }
  }
}

export default function jQuerySet($) {
  $.fn.set = function(info) {
    this.each(function(_, panel) {
      $(panel)
        .find(
          ".properties-panel input, .properties-panel select, .properties-panel button"
        )
        .each(function(_, input) {
          const prop = $(input).data("attr");
          if (prop) {
            setProp(input, prop, info);
          }
        });
    });
    return this;
  };

  return $;
}
