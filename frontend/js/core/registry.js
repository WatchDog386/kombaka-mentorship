// Where views and actions register themselves.

// Views, button actions and input handlers register themselves here.
//   V.<view>(): returns the HTML for a view.
//   A.<name>(dataset, element, event): runs when an element with data-act="<name>" is clicked,
//     or when a form with data-sub="<name>" is submitted.
//   onInput / onChange: the same for data-in="<name>" and data-ch="<name>".
export const V = {};
export const A = {};
export const onInput = {};
export const onChange = {};
