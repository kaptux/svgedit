function setProp(input, prop, info) {
  console.log("setting ", prop);
  const tokens = prop.split(".");
  let current = info;
  for (const p of tokens) {
    current = current[p];
  }
  $(input).val(current);
}

export default function jQuerySet($) {
  $.fn.set = function(info) {
    this.each(function(_, panel) {
      $(panel)
        .find(".properties-panel input")
        .each(function(_, input) {
          const prop = $(input).data("property");
          if (prop) {
            setProp(input, prop, info);
          }
        });
    });
    return this;
  };

  return $;
}
