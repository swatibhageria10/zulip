"use strict";

const {strict: assert} = require("assert");

const _ = require("lodash");

const {mock_esm, zrequire, set_global} = require("../zjsunit/namespace");
const {run_test} = require("../zjsunit/test");
const blueslip = require("../zjsunit/zblueslip");
const $ = require("../zjsunit/zjquery");

const message_viewport = mock_esm("../../static/js/message_viewport");

const ls_container = new Map();
set_global("localStorage", {
    getItem(key) {
        return ls_container.get(key);
    },
    setItem(key, val) {
        ls_container.set(key, val);
    },
    removeItem(key) {
        ls_container.delete(key);
    },
    clear() {
        ls_container.clear();
    },
});

const people = zrequire("people");
const {BuddyList} = zrequire("buddy_list");
function init_simulated_scrolling() {
    const elem = {
        dataset: {},
        scrollTop: 0,
        scrollHeight: 0,
    };

    $.create("#buddy_list_wrapper", {children: [elem]});

    $("#buddy_list_wrapper_padding").set_height(0);

    return elem;
}

const alice = {
    email: "alice@zulip.com",
    user_id: 10,
    full_name: "Alice Smith",
};

const bob = {
    email: "bob@zulip.com",
    user_id: 11,
    full_name: "bob Smith",
};
people.add_active_user(bob);

run_test("get_items", () => {
    const buddy_list = new BuddyList();

    // We don't make alice_li an actual jQuery stub,
    // because our test only cares that it comes
    // back from get_items.
    const alice_li = "alice stub";
    const sel = "li.user_sidebar_entry";
    const container = $.create("get_items container", {
        children: [{to_$: () => alice_li}],
    });
    buddy_list.container.set_find_results(sel, container);

    const items = buddy_list.get_items();
    assert.deepEqual(items, [alice_li]);
});

run_test("basics", ({override, mock_template}) => {
    mock_template("user_presence_sections.hbs", false, (data) => {
        assert.equal(data.users_count, "translated:  (1)");
        assert.equal(data.others_count, "translated:  (1)");
        return "html-stub-from-template";
    });

    const buddy_list = new BuddyList();
    init_simulated_scrolling();

    override(buddy_list, "get_data_from_keys", () => "data-stub");

    override(buddy_list, "items_to_html", (opts) => {
        assert.equal(opts.items, "data-stub");
        return "html-stub";
    });

    override(message_viewport, "height", () => 550);

    let call_count = 0;
    $("#user_presences").append = (html) => {
        if (call_count === 0) {
            assert.equal(html, "html-stub-from-template");
        }
        if (call_count === 1) {
            assert.equal(html, "html-stub");
        }
        call_count += 1;
    };

    buddy_list.populate({
        user_keys: [alice.user_id],
        other_keys: [bob.user_id],
    });
    assert.equal(call_count, 2);

    const alice_li = {length: 1};

    override(buddy_list, "get_li_from_key", (opts) => {
        const key = opts.key;

        assert.equal(key, alice.user_id);
        return alice_li;
    });

    const li = buddy_list.find_li({
        key: alice.user_id,
    });
    assert.equal(li, alice_li);
});

run_test("big_list", ({mock_template, override}) => {
    mock_template("user_presence_sections.hbs", false, () => {});

    const buddy_list = new BuddyList();
    const elem = init_simulated_scrolling();

    // Don't actually render, but do simulate filling up
    // the screen.
    let chunks_inserted = 0;

    override(buddy_list, "all_users_render_more", () => {
        elem.scrollHeight += 100;
        chunks_inserted += 1;
    });
    override(message_viewport, "height", () => 550);

    // We will have more than enough users, but still
    // only do 6 chunks of data.
    const num_users = 300;
    const user_ids = [];

    _.times(num_users, (i) => {
        const person = {
            email: "foo" + i + "@zulip.com",
            user_id: 100 + i,
            full_name: "Somebody " + i,
        };
        people.add_active_user(person);
        user_ids.push(person.user_id);
    });

    buddy_list.populate({
        user_keys: user_ids,
        other_keys: [],
    });

    assert.equal(chunks_inserted, 6);
});

run_test("force_render", ({override}) => {
    const buddy_list = new BuddyList();
    buddy_list.users_render_count = 50;

    let num_rendered = 0;
    override(buddy_list, "users_render_more", (opts) => {
        num_rendered += opts.chunk_size;
    });

    buddy_list.force_render_users({
        pos: 60,
    });

    assert.equal(num_rendered, 60 - 50 + 3);

    // Force a contrived error case for line coverage.
    blueslip.expect("error", "cannot show key at this position: 10");
    buddy_list.force_render_users({
        pos: 10,
    });

    blueslip.reset();

    buddy_list.others_render_count = 50;
    num_rendered = 0;
    override(buddy_list, "others_render_more", (opts) => {
        num_rendered += opts.chunk_size;
    });

    buddy_list.force_render_others({
        pos: 60,
    });

    assert.equal(num_rendered, 60 - 50 + 3);

    // // Force a contrived error case for line coverage.
    blueslip.expect("error", "cannot show key at this position: 10");
    buddy_list.force_render_others({
        pos: 10,
    });
});

run_test("find_li w/force_render", ({override}) => {
    const buddy_list = new BuddyList();

    // If we call find_li w/force_render set, and the
    // key is not already rendered in DOM, then the
    // widget will call show_key to force-render it.
    const key = "999";
    const stub_li = {length: 0};

    override(buddy_list, "get_li_from_key", (opts) => {
        assert.equal(opts.key, key);
        return stub_li;
    });

    buddy_list.user_keys = ["foo", "bar", key, "baz"];

    let shown;

    // override(buddy_list, "force_render", (opts) => {
    //     assert.equal(opts.pos, 2);
    //     shown = true;
    // });

    const empty_li = buddy_list.find_li({
        key,
    });
    assert.equal(empty_li, stub_li);
    assert.ok(!shown);

    const li = buddy_list.find_li({
        key,
        force_render: true,
    });

    assert.equal(li, stub_li);
    // assert.ok(shown);
});

run_test("find_li w/bad key", ({override}) => {
    const buddy_list = new BuddyList();
    override(buddy_list, "get_li_from_key", () => ({length: 0}));

    const undefined_li = buddy_list.find_li({
        key: "not-there",
        force_render: true,
    });

    assert.deepEqual(undefined_li, []);
});

run_test("two section layout collapse persistence", ({mock_template, override}) => {
    people.add_active_user(alice);
    const buddy_list = new BuddyList();
    override(buddy_list, "fill_screen_with_content", () => {});
    mock_template("user_presence_sections.hbs", false, (args) => {
        assert.equal(args.users_title_collapsed, false);
        assert.equal(args.others_title_collapsed, false);
    });
    buddy_list.populate({
        user_keys: [alice.user_id],
        other_keys: [bob.user_id],
    });
    $("#users").get_on_handler("hide")();
    $("#others").get_on_handler("hide")();
    mock_template("user_presence_sections.hbs", false, (args) => {
        assert.equal(args.users_title_collapsed, true);
        assert.equal(args.others_title_collapsed, true);
    });
    buddy_list.populate({
        user_keys: [alice.user_id],
        other_keys: [bob.user_id],
    });

    $("#users").get_on_handler("show")();
    $("#others").get_on_handler("show")();
    mock_template("user_presence_sections.hbs", false, (args) => {
        assert.equal(args.users_title_collapsed, false);
        assert.equal(args.others_title_collapsed, false);
    });
    buddy_list.populate({
        user_keys: [alice.user_id],
        other_keys: [bob.user_id],
    });
});
